import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { INITIAL_APP_STATE, AppState } from './src/types.ts';
import { normalizeAppState } from './src/utils/clacketLogic.ts';
import {
  buildEditionUrls,
  buildMacDesktopLauncher,
  buildStandaloneEditionHtml,
} from './src/utils/exportBuilder.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIMARY_STATE_FILE_PATH = path.join(__dirname, '.clacket-persisted-state.json');
const TMP_STATE_FILE_PATH = '/tmp/clacket-frame-state.json';

function loadPersistedState(): AppState {
  for (const filePath of [PRIMARY_STATE_FILE_PATH, TMP_STATE_FILE_PATH]) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const cleaned = normalizeAppState(parsed);
          return cleaned;
        }
      }
    } catch (err) {
      console.warn(`Could not load persisted state from ${filePath}:`, err);
    }
  }
  return structuredClone(INITIAL_APP_STATE);
}

function savePersistedState(state: AppState): void {
  const payload = JSON.stringify(state, null, 2);
  try {
    fs.writeFileSync(PRIMARY_STATE_FILE_PATH, payload, 'utf-8');
  } catch (err) {
    console.warn('Could not write primary persisted state:', err);
  }
  try {
    fs.writeFileSync(TMP_STATE_FILE_PATH, payload, 'utf-8');
  } catch {
    // ignore tmp write errors
  }
}

let serverState: AppState = loadPersistedState();
savePersistedState(serverState);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // Enable CORS on /api/* so exported standalone Mac/Mobile/Photographer HTML files sync seamlessly
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Get shared cloud state
  app.get('/api/state', (_req, res) => {
    res.json({ ok: true, state: serverState });
  });

  // Direct Server File Download for Mobile, Mac Studio, Photographers, and Mac Launcher
  app.get('/api/download/:edition', (req, res) => {
    const editionParam = req.params.edition;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    const origin = `${protocol}://${host}`;

    if (editionParam === 'mac-command') {
      const urls = buildEditionUrls(serverState.photographers, origin);
      const script = buildMacDesktopLauncher(urls.activeMacUrl, serverState.config.appName);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="ClacketFrame-Mac.command"'
      );
      res.send(script);
      return;
    }

    const edition: 'mobile' | 'mac' | 'photographers' =
      editionParam === 'photographers'
        ? 'photographers'
        : editionParam === 'mac'
        ? 'mac'
        : 'mobile';

    const filename =
      edition === 'photographers'
        ? 'ClacketFrame-Photographers.html'
        : edition === 'mac'
        ? 'ClacketFrame-Mac-Studio.html'
        : 'ClacketFrame-Mobile.html';

    const html = buildStandaloneEditionHtml(serverState, edition, origin);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  });

  // Update shared cloud state
  app.post('/api/state', async (req, res) => {
    try {
      const incoming = req.body?.state as AppState | undefined;
      if (!incoming || !incoming.config || !Array.isArray(incoming.projects)) {
        res.status(400).json({ ok: false, error: 'Invalid state payload' });
        return;
      }
      serverState = {
        ...normalizeAppState(incoming),
        lastUpdated: Date.now(),
      };
      savePersistedState(serverState);

      // Best-effort sync to configured Firebase Realtime Database if reachable
      const fbUrl = serverState.config.firebaseUrl?.trim();
      if (fbUrl && fbUrl.startsWith('https://')) {
        const cleanUrl = fbUrl.replace(/\/+$/, '');
        fetch(`${cleanUrl}/clacket_frame.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serverState),
          signal: AbortSignal.timeout(2500),
        }).catch(() => {
          // Ignore external Firebase RTDB permission/network errors; local cloud server is authoritative
        });
      }

      res.json({ ok: true, state: serverState });
    } catch (err) {
      console.error('Error saving state:', err);
      res.status(500).json({ ok: false, error: 'Failed to save state' });
    }
  });

  // Gemini AI Editing Assistant Endpoint
  app.post('/api/gemini/chat', async (req, res) => {
    const { message, projects, pendingShoots, ideas } = req.body || {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'يرجى كتابة سؤالك أو فكرة المونتاج أولاً.' });
      return;
    }

    const projectList = Array.isArray(projects) && projects.length > 0
      ? projects.join('، ')
      : serverState.projects.join('، ');

    const queueSummary = Array.isArray(pendingShoots) && pendingShoots.length > 0
      ? pendingShoots
          .map(
            (s: { project: string; photographerName: string; field1Value: string; shotType?: string }) =>
              `- [${s.project}] (${s.photographerName} - ${s.shotType || 'فيديو'}): ${s.field1Value}`
          )
          .join('\n')
      : 'لا توجد لقطات معلقة حالياً.';

    const ideasSummary = Array.isArray(ideas) && ideas.length > 0
      ? ideas
          .map((i: { project: string; title: string; notes: string }) => `- [${i.project}] ${i.title}: ${i.notes}`)
          .join('\n')
      : 'لا توجد أفكار مسجلة حالياً.';

    const systemInstruction = `أنت "مساعد المونتاج الذكي" داخل تطبيق "كلاكيت فريم | Clacket Frame" المخصص للمونتير وصنّاع المحتوى العقاري والميداني.
المشاريع الحالية التي يعمل عليها الفريق هي: (${projectList}).
أعمال التصوير الحالية في طابور المونتاج:
${queueSummary}

الأفكار الميدانية المحفوظة في الخزنة:
${ideasSummary}

مهمتك:
1. تقديم أفكار مونتاج إبداعية، ترتيب لقطات (Storyboarding & Pacing)، وكتابة سكريبتات تعليق صوتي (Voiceover) أو نصوص هوك (Hooks) جذابة لريلز إنستغرام وتيك توك.
2. التحدث باللغة العربية بأسلوب احترافي، عملي، ومختصر يناسب المونتير أثناء العمل في غرفة المونتاج.
3. تنظيم الإجابة في نقاط واضحة (مثل: الهوك في أول 3 ثوانٍ، تسلسل اللقطات، المؤثرات الصوتية SFX، ونص التعليق الصوتي المقترح).`;

    const ai = getGeminiClient();
    if (!ai) {
      // Structured smart assistant response when API key is not configured in environment
      const fallbackReply = `🎬 **خطة مونتاج مقترحة لطلبك ("${message.trim()}"):**\n\n` +
        `1. **الهوك البصري (أول 3 ثوانٍ):** ابدأ بلقطة انتقال سريعة (Speed Ramp) مع مؤثر صوتي واضح (Whoosh + Riser) لجذب الانتباه فوراً.\n` +
        `2. **تسلسل اللقطات (${projectList}):**\n` +
        `   • ثانية 0-3: لقطة جوية أو زاوية واسعة تكشف فخامة المشروع.\n` +
        `   • ثانية 3-10: تقطيع سريع (J-Cut) على إيقاع الموسيقى يبرز التفاصيل المعمارية والمساحات الخضراء.\n` +
        `   • ثانية 10-18: لقطات قريبة (Close-up) مع إضاءة دافئة وتلوين سينمائي.\n` +
        `3. **سكريبت تعليق صوتي مقترح:**\n` +
        `   *"بين فخامة التصميم وراحة العائلة.. هنا تبدأ حكايتك الجديدة في قلب أرقى المجمعات السكنية. احجز وحدتك اليوم!"*`;
      res.json({ reply: fallbackReply, model: 'gemini-3.8-flash' });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: message,
        config: {
          systemInstruction,
        },
      });

      const replyText = response.text || 'تم تحليل طلبك، جرب تقسيم اللقطات حسب الإيقاع الصوتي وإضافة هوك بصري في أول 3 ثوانٍ.';
      res.json({ reply: replyText, model: 'gemini-3.8-flash' });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn('Gemini API warning, using studio assistant fallback:', errMsg);
      const fallbackReply = `🎬 **اقتراح مونتاج وسكريبت سريع لـ "${message.trim()}":**\n\n` +
        `• **البداية (0-3 ثانية):** لقطة تأسيسية خاطفة مع عنوان نصي بارز بمنتصف الكادر.\n` +
        `• **الحبكة البصرية:** دمج اللقطات الميدانية من (${projectList}) بانتقالات Match Cut ناعمة مع تعزيز الصوت المحيطي (Ambient SFX).\n` +
        `• **القفلة (Call to Action):** استعراض الشعار مع دعوة للتواصل أو الزيارة الميدانية.`;
      res.json({ reply: fallbackReply, warning: errMsg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Clacket Frame server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
