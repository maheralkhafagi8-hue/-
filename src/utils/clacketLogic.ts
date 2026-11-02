import {
  AppState,
  AudioTaskItem,
  CounterConfig,
  CustomCounterField,
  DirectorAchievementItem,
  INITIAL_APP_STATE,
  INITIAL_COUNTER_CONFIG,
  IdeaItem,
  Photographer,
  PhotographerNotification,
  ReminderScheduleConfig,
  ShootItem,
  ShootStatus,
} from '../types';

export interface PhotographerStatSummary {
  photographer: Photographer;
  totalShoots: number;
  pendingCount: number;
  editingCount: number;
  completedCount: number;
  completionRate: number;
  projectBreakdown: Record<string, number>;
  lastShootTitle: string | null;
}

const LEGACY_DEMO_PHOTOGRAPHER_NAMES = new Set([
  'أحمد المصور',
  'علي الدرون',
  'حسين الميداني',
]);

const LEGACY_DEMO_SHOOT_IDS = new Set(['shoot-101', 'shoot-102', 'shoot-103']);

export function normalizeAppState(raw: Partial<AppState> | null | undefined): AppState {
  if (!raw || typeof raw !== 'object') {
    return INITIAL_APP_STATE;
  }

  const rawCounter = raw.counterConfig;
  const counterConfig: CounterConfig = {
    tabTitle: rawCounter?.tabTitle || INITIAL_COUNTER_CONFIG.tabTitle,
    directorCardTitle:
      rawCounter?.directorCardTitle || INITIAL_COUNTER_CONFIG.directorCardTitle,
    directorCustomItems: Array.isArray(rawCounter?.directorCustomItems)
      ? rawCounter.directorCustomItems
      : INITIAL_COUNTER_CONFIG.directorCustomItems,
    photographerCustomFields: Array.isArray(rawCounter?.photographerCustomFields)
      ? rawCounter.photographerCustomFields
      : INITIAL_COUNTER_CONFIG.photographerCustomFields,
    photographerCustomCounts:
      rawCounter?.photographerCustomCounts &&
      typeof rawCounter.photographerCustomCounts === 'object'
        ? rawCounter.photographerCustomCounts
        : INITIAL_COUNTER_CONFIG.photographerCustomCounts,
  };

  const mergedConfig = {
    ...INITIAL_APP_STATE.config,
    ...(raw.config || {}),
  };
  if (
    !mergedConfig.directorName ||
    mergedConfig.directorName.trim() === 'المونتير' ||
    mergedConfig.directorName.trim() === 'المونتير ماهر'
  ) {
    mergedConfig.directorName = 'ماهر الخفاجي';
  }
  if (
    !mergedConfig.directorPin ||
    mergedConfig.directorPin.trim() === '1234' ||
    mergedConfig.directorPin.trim() === '2026'
  ) {
    mergedConfig.directorPin = '199400';
  }
  if (mergedConfig.directorFaceIdEnabled === undefined) {
    mergedConfig.directorFaceIdEnabled = false;
  }

  const cleanedPhotographers = Array.isArray(raw.photographers)
    ? raw.photographers
        .filter((p) => p && !LEGACY_DEMO_PHOTOGRAPHER_NAMES.has(p.name?.trim()))
        .map((p) => ({
          ...p,
          faceIdEnabled: p.faceIdEnabled ?? false,
        }))
    : INITIAL_APP_STATE.photographers;

  const cleanedShoots = Array.isArray(raw.shoots)
    ? raw.shoots.filter(
        (s) =>
          s &&
          !LEGACY_DEMO_SHOOT_IDS.has(s.id) &&
          !LEGACY_DEMO_PHOTOGRAPHER_NAMES.has(s.photographerName?.trim())
      )
    : INITIAL_APP_STATE.shoots;

  const rawReminder =
    raw.activeReminder !== undefined ? raw.activeReminder : INITIAL_APP_STATE.activeReminder;
  const isLegacyDemoReminder =
    typeof rawReminder === 'string' &&
    (rawReminder.includes('أحمد المصور') ||
      rawReminder.includes('علي الدرون') ||
      rawReminder.includes('حسين الميداني'));

  return {
    config: mergedConfig,
    projects:
      Array.isArray(raw.projects) && raw.projects.length > 0
        ? raw.projects
        : INITIAL_APP_STATE.projects,
    photographers: cleanedPhotographers,
    shoots: cleanedShoots,
    ideas:
      Array.isArray(raw.ideas) && raw.ideas.length > 0
        ? raw.ideas.map((idea) => ({
            ...idea,
            approvedForPhotographers: Boolean(idea.approvedForPhotographers),
            isSuggestedByApp: idea.isSuggestedByApp ?? true,
          }))
        : INITIAL_APP_STATE.ideas,
    audioTasks: Array.isArray(raw.audioTasks)
      ? raw.audioTasks.filter((t) => t.id !== 'audio-301' && t.id !== 'audio-302')
      : INITIAL_APP_STATE.audioTasks,
    photographerNotifications: Array.isArray(raw.photographerNotifications)
      ? raw.photographerNotifications
      : [],
    activeReminder: isLegacyDemoReminder ? null : rawReminder,
    activeReminderShootId:
      raw.activeReminderShootId && !LEGACY_DEMO_SHOOT_IDS.has(raw.activeReminderShootId)
        ? raw.activeReminderShootId
        : null,
    reminderSchedule: raw.reminderSchedule || INITIAL_APP_STATE.reminderSchedule,
    counterConfig,
    lastUpdated: typeof raw.lastUpdated === 'number' ? raw.lastUpdated : 0,
  };
}

export function updatePhotographerSelfCredentials(
  state: AppState,
  photographerId: string,
  input: { newPin?: string; faceIdEnabled?: boolean }
): { ok: true; nextState: AppState; updatedPhotographer: Photographer } | { ok: false; error: string } {
  const photog = state.photographers.find((p) => p.id === photographerId);
  if (!photog) {
    return { ok: false, error: 'لم يتم العثور على حساب المصور' };
  }

  let nextPin = photog.pin;
  if (input.newPin !== undefined) {
    const cleanPin = input.newPin.trim();
    if (cleanPin.length < 3) {
      return { ok: false, error: 'يرجى إدخال رمز سري لا يقل عن 3 أرقام أو حروف' };
    }
    nextPin = cleanPin;
  }

  const updatedPhotographer: Photographer = {
    ...photog,
    pin: nextPin,
    faceIdEnabled:
      input.faceIdEnabled !== undefined ? input.faceIdEnabled : (photog.faceIdEnabled ?? false),
  };

  const nextState: AppState = {
    ...state,
    photographers: state.photographers.map((p) =>
      p.id === photographerId ? updatedPhotographer : p
    ),
  };

  return { ok: true, nextState, updatedPhotographer };
}

export function verifyAccountPin(
  state: AppState,
  targetAccountId: 'director' | string,
  enteredPin: string
): { valid: boolean; role: 'director' | 'photographer' | null; photographer?: Photographer } {
  const cleanPin = enteredPin.trim();
  if (!cleanPin) {
    return { valid: false, role: null };
  }

  if (targetAccountId === 'director') {
    if (cleanPin === state.config.directorPin.trim()) {
      return { valid: true, role: 'director' };
    }
    return { valid: false, role: null };
  }

  const photog = state.photographers.find((p) => p.id === targetAccountId);
  if (photog && cleanPin === photog.pin.trim()) {
    return { valid: true, role: 'photographer', photographer: photog };
  }

  return { valid: false, role: null };
}

export function authenticateUserByCredentials(
  state: AppState,
  enteredUsername: string,
  enteredPassword: string
): {
  valid: boolean;
  role: 'director' | 'photographer' | null;
  photographer?: Photographer;
  error?: string;
} {
  const normalizeName = (str: string) => str.trim().replace(/\s+/g, ' ');
  const cleanUser = normalizeName(enteredUsername);
  const cleanPass = enteredPassword.trim();

  if (!cleanUser) {
    return { valid: false, role: null, error: 'يرجى كتابة اسم المستخدم (الاسم)' };
  }
  if (!cleanPass) {
    return { valid: false, role: null, error: 'يرجى كتابة الرمز السري (الباسورد)' };
  }

  const configuredAdminName = normalizeName(state.config.directorName || 'ماهر الخفاجي');
  const configuredAdminPin = (state.config.directorPin || '199400').trim();

  const isDirectorMatch =
    (cleanUser === configuredAdminName || cleanUser === 'ماهر الخفاجي') &&
    cleanPass === configuredAdminPin;

  if (isDirectorMatch) {
    return { valid: true, role: 'director' };
  }

  const matchedPhotog = state.photographers.find(
    (p) => normalizeName(p.name) === cleanUser && p.pin.trim() === cleanPass
  );

  if (matchedPhotog) {
    return { valid: true, role: 'photographer', photographer: matchedPhotog };
  }

  return {
    valid: false,
    role: null,
    error: 'اسم المستخدم أو الرمز السري غير صحيح، تأكد من كتابة الاسم والرمز بشكل مطابق',
  };
}

export function getPendingShootsCount(shoots: ShootItem[]): {
  pending: number;
  editing: number;
  completed: number;
  actionRequired: number;
} {
  let pending = 0;
  let editing = 0;
  let completed = 0;
  for (const s of shoots) {
    if (s.status === 'pending') pending++;
    else if (s.status === 'editing') editing++;
    else if (s.status === 'completed') completed++;
  }
  return {
    pending,
    editing,
    completed,
    actionRequired: pending + editing,
  };
}

export function calculatePhotographerStats(
  shoots: ShootItem[],
  photographers: Photographer[],
  projects: string[]
): PhotographerStatSummary[] {
  return photographers.map((photog) => {
    const myShoots = shoots.filter(
      (s) => s.photographerId === photog.id || s.photographerName === photog.name
    );
    const totalShoots = myShoots.length;
    const pendingCount = myShoots.filter((s) => s.status === 'pending').length;
    const editingCount = myShoots.filter((s) => s.status === 'editing').length;
    const completedCount = myShoots.filter((s) => s.status === 'completed').length;
    const completionRate =
      totalShoots > 0 ? Math.round((completedCount / totalShoots) * 100) : 0;

    const projectBreakdown: Record<string, number> = {};
    for (const proj of projects) {
      projectBreakdown[proj] = myShoots.filter((s) => s.project === proj).length;
    }

    return {
      photographer: photog,
      totalShoots,
      pendingCount,
      editingCount,
      completedCount,
      completionRate,
      projectBreakdown,
      lastShootTitle: myShoots.length > 0 ? myShoots[0].field1Value : null,
    };
  });
}

export function createShootRecord(
  input: {
    project: string;
    field1Value: string;
    field2Value: string;
    shotType?: string;
    isUrgent?: boolean;
    reminderNote?: string;
  },
  photographer: Photographer,
  nowFormatted?: string
): { ok: true; shoot: ShootItem } | { ok: false; error: string } {
  const project = input.project.trim();
  const field1Value = input.field1Value.trim();
  const field2Value = input.field2Value.trim();

  if (!project) {
    return { ok: false, error: 'يرجى اختيار المشروع أولاً' };
  }
  if (!field1Value) {
    return { ok: false, error: 'يرجى كتابة تفاصيل اللقطات أو موضوع التصوير' };
  }
  if (!field2Value) {
    return { ok: false, error: 'يرجى إدخال الملاحظات للمونتير أو مكان الملفات' };
  }

  const shoot: ShootItem = {
    id: `shoot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    project,
    photographerId: photographer.id,
    photographerName: photographer.name,
    field1Value,
    field2Value,
    shotType: input.shotType?.trim() || 'تغطية ميدانية 4K',
    status: 'pending',
    createdAt:
      nowFormatted ||
      new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
    isUrgent: Boolean(input.isUrgent),
    reminderNote: input.reminderNote?.trim() || undefined,
    audioStatus: 'none',
  };

  return { ok: true, shoot };
}

export function createIdeaRecord(input: {
  project: string;
  title: string;
  link?: string;
  notes?: string;
  approvedForPhotographers?: boolean;
  isSuggestedByApp?: boolean;
}): { ok: true; idea: IdeaItem } | { ok: false; error: string } {
  const project = input.project.trim();
  const title = input.title.trim();
  if (!project) {
    return { ok: false, error: 'يرجى تحديد المشروع الخاص بالفكرة' };
  }
  if (!title) {
    return { ok: false, error: 'يرجى كتابة عنوان الفكرة أو الزاوية المطلوبة' };
  }

  const idea: IdeaItem = {
    id: `idea-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    project,
    title,
    link: input.link?.trim() || '',
    notes: input.notes?.trim() || 'بدون ملاحظات إضافية',
    createdAt: new Date().toISOString().split('T')[0],
    isCompleted: false,
    approvedForPhotographers: Boolean(input.approvedForPhotographers),
    isSuggestedByApp: Boolean(input.isSuggestedByApp),
  };

  return { ok: true, idea };
}

export const IDEA_SUGGESTION_TEMPLATES: {
  title: string;
  notes: string;
  link?: string;
}[] = [
  {
    title: 'زاوية منخفضة (Low Angle) مع انعكاس الواجهات الزجاجية وقت الساعة الذهبية',
    notes: 'تصوير بعدسة 24mm قريبة من الأرض لإبراز فخامة وارتفاع البنايات مع أشعة الشمس الدافئة.',
  },
  {
    title: 'لقطة تتبع (Tracking Shot) لسيارة تدخل البوابة الرئيسية للمشروع',
    notes: 'تبدأ اللقطة من خلف البوابة وتتحرك الكاميرا بمحاذاة السيارة حتى التوقف أمام الفيلا.',
  },
  {
    title: 'تايم لابس (Hyperlapse) متحرك من النهار إلى المساء مع إضاءة الحدائق',
    notes: 'التقاط 150 صورة بخطوة ثابتة باتجاه المعلم الرئيسي للمشروع لدمجها كـ Hook افتتاحي.',
  },
  {
    title: 'لقطة FPV درون سريعة تمر بين الأشجار والنافورات إلى الواجهة',
    notes: 'مسار طيران منخفض وسلس يكشف المساحات الخضراء ثم يرتفع تدريجياً لإظهار المشروع بالكامل.',
  },
  {
    title: 'مقابلة ميدانية سريعة (Vox Pop / مهندس المشروع) مع B-Roll سينمائي',
    notes: 'تصوير المهندس بعمق ميدان ضحل (f/1.8) مع لقطات تفصيلية لمواد البناء والتشطيبات الفاخرة.',
  },
  {
    title: 'انتقال باليد على عدسة الكاميرا (Whip Pan & Mask Transition) بين الغرف',
    notes: 'الانتقال من الصالة الرئيسية إلى المطبخ ثم الحديقة الخلفية بحركة دوران سريعة متناسقة.',
  },
  {
    title: 'لقطة تفصيلية (Macro / Close-up) لتشغيل الإضاءة الذكية والمفاتيح العصرية',
    notes: 'التركيز على التفاصيل الهندسية الدقيقة، الرخام، والإضاءة المخفية مع مؤثرات صوتية ناعمة.',
  },
  {
    title: 'زاوية علوية دائرية (Orbit Drone Shot) بزاوية 360 درجة حول السنتر الترفيهي',
    notes: 'تثبيت الهدف في منتصف الكادر والدوران بسرعة ثابتة على ارتفاع 40 متر وقت الغروب.',
  },
  {
    title: 'لقطة شباك الإطلالة (Window Reveal) من داخل الشقة نحو الحدائق الوسطية',
    notes: 'تبدأ الكاميرا داخل الغرفة المظلمة نسبياً وتتقدم نحو الشباك لتكشف الإطلالة الخارجية المشرقة.',
  },
  {
    title: 'تغطية أجواء العوائل والأطفال في الممرات والمساحات الخضراء (Lifestyle Reel)',
    notes: 'لقطات عفوية بطيئة (Slow Motion 60fps) تعكس الحياة والرفاهية داخل البارك والمجمع.',
  },
];

export function generateSmartIdeaSuggestions(
  projects: string[],
  existingTitles: string[],
  count = 3,
  targetProject?: string
): IdeaItem[] {
  const validProjects =
    Array.isArray(projects) && projects.length > 0
      ? projects
      : INITIAL_APP_STATE.projects;
  const existingSet = new Set(existingTitles.map((t) => t.trim()));

  const availablePool = IDEA_SUGGESTION_TEMPLATES.filter(
    (tpl) => !existingSet.has(tpl.title.trim())
  );
  const sourcePool =
    availablePool.length >= count ? availablePool : IDEA_SUGGESTION_TEMPLATES;

  const picked: IdeaItem[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < count; i++) {
    const tpl = sourcePool[i % sourcePool.length];
    const proj =
      targetProject && targetProject !== 'all'
        ? targetProject
        : validProjects[i % validProjects.length];
    picked.push({
      id: `idea-sug-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      project: proj,
      title:
        availablePool.length < count && existingSet.has(tpl.title)
          ? `${tpl.title} (${proj})`
          : tpl.title,
      link: tpl.link || '',
      notes: tpl.notes,
      createdAt: today,
      isCompleted: false,
      approvedForPhotographers: false,
      isSuggestedByApp: true,
    });
  }

  return picked;
}

export function createAudioTaskRecord(input: {
  project: string;
  title: string;
  voiceArtist: string;
  scriptText: string;
  linkedShootId?: string;
}): { ok: true; task: AudioTaskItem } | { ok: false; error: string } {
  const project = input.project.trim();
  const title = input.title.trim();
  const voiceArtist = input.voiceArtist.trim();
  const scriptText = input.scriptText.trim();

  if (!project || !title || !scriptText) {
    return { ok: false, error: 'يرجى إدخال عنوان التسجيل، المشروع، ونص السكريبت الصوتي' };
  }

  const task: AudioTaskItem = {
    id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    project,
    title,
    voiceArtist: voiceArtist || 'معلق صوتي عام',
    scriptText,
    status: 'waiting',
    linkedShootId: input.linkedShootId || undefined,
    createdAt: 'الآن',
  };

  return { ok: true, task };
}

export function filterShoots(
  shoots: ShootItem[],
  projectFilter: string,
  statusFilter: 'all' | ShootStatus,
  searchQuery: string
): ShootItem[] {
  const q = searchQuery.trim().toLowerCase();
  return shoots.filter((item) => {
    // Completed shoots disappear from the active editing queue and move to achievements
    if (statusFilter === 'all' && item.status === 'completed') {
      return false;
    }
    if (projectFilter !== 'all' && item.project !== projectFilter) {
      return false;
    }
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }
    if (q) {
      const hay = `${item.project} ${item.photographerName} ${item.field1Value} ${item.field2Value} ${item.shotType}`.toLowerCase();
      return hay.includes(q);
    }
    return true;
  });
}

export function formatDirectorTitle(directorName: string): string {
  const trimmed = (directorName || '').trim();
  if (!trimmed || trimmed === 'المونتير') {
    return 'المونتير ماهر';
  }
  if (trimmed.includes('المونتير')) {
    return trimmed;
  }
  return `المونتير ${trimmed}`;
}

export function createStartEditingNotification(
  shoot: ShootItem,
  directorName: string,
  nowFormatted?: string
): PhotographerNotification {
  const formattedDirector = formatDirectorTitle(directorName);
  return {
    id: `pnotif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    photographerId: shoot.photographerId,
    photographerName: shoot.photographerName,
    shootId: shoot.id,
    project: shoot.project,
    shootTitle: shoot.field1Value,
    directorName: formattedDirector,
    message: `🎬 ${formattedDirector} بدأ في العمل على هذا المشروع (${shoot.project}) — ${shoot.field1Value}`,
    createdAt:
      nowFormatted ||
      new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
    timestamp: Date.now(),
    read: false,
  };
}

export function renamePhotographerInState(
  state: AppState,
  photographerId: string,
  newName: string
): AppState {
  const cleanName = newName.trim();
  if (!cleanName) return state;

  const target = state.photographers.find((p) => p.id === photographerId);
  if (!target) return state;
  const oldName = target.name;

  return {
    ...state,
    photographers: state.photographers.map((p) =>
      p.id === photographerId ? { ...p, name: cleanName } : p
    ),
    shoots: state.shoots.map((s) =>
      s.photographerId === photographerId || s.photographerName === oldName
        ? { ...s, photographerName: cleanName }
        : s
    ),
  };
}

export function renameProjectInState(
  state: AppState,
  projectIndex: number,
  newProjectName: string
): AppState {
  const cleanName = newProjectName.trim();
  if (!cleanName || projectIndex < 0 || projectIndex >= state.projects.length) {
    return state;
  }

  const oldName = state.projects[projectIndex];
  if (oldName === cleanName) return state;

  const updatedProjects = state.projects.map((p, idx) =>
    idx === projectIndex ? cleanName : p
  );

  return {
    ...state,
    projects: updatedProjects,
    shoots: state.shoots.map((s) =>
      s.project === oldName ? { ...s, project: cleanName } : s
    ),
    ideas: state.ideas.map((i) =>
      i.project === oldName ? { ...i, project: cleanName } : i
    ),
    audioTasks: state.audioTasks.map((a) =>
      a.project === oldName ? { ...a, project: cleanName } : a
    ),
  };
}

export interface AdminDraftState {
  firebaseUrl: string;
  appName: string;
  directorName: string;
  directorPin: string;
  welcomeQuote: string;
  field1Label: string;
  field2Label: string;
  telegramUrl: string;
  enableAudioSection: boolean;
  photographers: Photographer[];
  projects: { originalName: string; currentName: string }[];
  counterTabTitle: string;
  directorCardTitle: string;
  directorCustomItems: DirectorAchievementItem[];
  photographerCustomFields: CustomCounterField[];
}

export function createAdminDraftFromState(state: AppState): AdminDraftState {
  const counterCfg = state.counterConfig || INITIAL_COUNTER_CONFIG;
  return {
    firebaseUrl: state.config.firebaseUrl,
    appName: state.config.appName,
    directorName: state.config.directorName,
    directorPin: state.config.directorPin,
    welcomeQuote: state.config.welcomeQuote,
    field1Label: state.config.field1Label,
    field2Label: state.config.field2Label,
    telegramUrl: state.config.telegramUrl,
    enableAudioSection: state.config.enableAudioSection,
    photographers: state.photographers.map((p) => ({ ...p })),
    projects: state.projects.map((proj) => ({
      originalName: proj,
      currentName: proj,
    })),
    counterTabTitle: counterCfg.tabTitle,
    directorCardTitle: counterCfg.directorCardTitle,
    directorCustomItems: counterCfg.directorCustomItems.map((item) => ({ ...item })),
    photographerCustomFields: counterCfg.photographerCustomFields.map((f) => ({ ...f })),
  };
}

export function applyAdminDraftToState(
  prevState: AppState,
  draft: AdminDraftState
): AppState {
  const projectMap = new Map<string, string>();
  const finalProjects: string[] = [];

  for (const item of draft.projects) {
    const cleaned = item.currentName.trim();
    if (cleaned) {
      finalProjects.push(cleaned);
      if (item.originalName && item.originalName !== cleaned) {
        projectMap.set(item.originalName, cleaned);
      }
    }
  }

  const photogNameMap = new Map<string, string>();
  const finalPhotographers: Photographer[] = draft.photographers.map((p) => {
    const cleanedName = p.name.trim() || 'مصور ميداني';
    const cleanedPin = p.pin.trim() || '0000';
    photogNameMap.set(p.id, cleanedName);
    return {
      ...p,
      name: cleanedName,
      pin: cleanedPin,
    };
  });

  const prevCounter = prevState.counterConfig || INITIAL_COUNTER_CONFIG;
  const finalDirectorItems = draft.directorCustomItems
    .map((item) => ({
      id: item.id,
      label: item.label.trim(),
      count: Number.isFinite(item.count) ? Math.max(0, item.count) : 0,
    }))
    .filter((item) => Boolean(item.label));

  const finalPhotogFields = draft.photographerCustomFields
    .map((f) => ({
      id: f.id,
      name: f.name.trim(),
    }))
    .filter((f) => Boolean(f.name));

  return {
    ...prevState,
    config: {
      ...prevState.config,
      firebaseUrl: draft.firebaseUrl.trim() || prevState.config.firebaseUrl,
      appName: draft.appName.trim() || 'كلاكيت فريم',
      directorName: draft.directorName.trim() || 'المونتير',
      directorPin: draft.directorPin.trim() || '1234',
      welcomeQuote:
        draft.welcomeQuote.trim() ||
        '✨ أهلاً بأبطال الميدان.. كل لقطة حلوة منكم تصنع فرق!',
      field1Label:
        draft.field1Label.trim() || 'تفاصيل اللقطات الميدانية / موضوع التصوير',
      field2Label:
        draft.field2Label.trim() || 'ملاحظات للمونتير / رقم الذاكرة أو الرابط',
      telegramUrl: draft.telegramUrl.trim() || 'https://t.me/',
      enableAudioSection: draft.enableAudioSection,
    },
    projects: finalProjects,
    photographers: finalPhotographers,
    shoots: prevState.shoots.map((s) => ({
      ...s,
      project: projectMap.get(s.project) ?? s.project,
      photographerName: photogNameMap.get(s.photographerId) ?? s.photographerName,
    })),
    ideas: prevState.ideas.map((i) => ({
      ...i,
      project: projectMap.get(i.project) ?? i.project,
    })),
    audioTasks: prevState.audioTasks.map((a) => ({
      ...a,
      project: projectMap.get(a.project) ?? a.project,
    })),
    counterConfig: {
      ...prevCounter,
      tabTitle: draft.counterTabTitle.trim() || 'عداد المصورين ومنجزاتي',
      directorCardTitle:
        draft.directorCardTitle.trim() || 'وحدة منجزاتي الخاصة (المونتير)',
      directorCustomItems: finalDirectorItems,
      photographerCustomFields: finalPhotogFields,
    },
  };
}

export interface ReminderPresetItem {
  value: '30' | '60' | '120' | '180' | '240' | '360' | 'custom';
  label: string;
  shortLabel: string;
  minutes: number;
}

export const REMINDER_PRESET_OPTIONS: ReminderPresetItem[] = [
  { value: '30', label: 'بعد نصف ساعة (30 دقيقة)', shortLabel: 'بعد نصف ساعة', minutes: 30 },
  { value: '60', label: 'بعد ساعة (60 دقيقة)', shortLabel: 'بعد ساعة', minutes: 60 },
  { value: '120', label: 'بعد ساعتين', shortLabel: 'بعد ساعتين', minutes: 120 },
  { value: '180', label: 'بعد 3 ساعات', shortLabel: 'بعد 3 ساعات', minutes: 180 },
  { value: '240', label: 'بعد 4 ساعات', shortLabel: 'بعد 4 ساعات', minutes: 240 },
  { value: '360', label: 'بعد 6 ساعات', shortLabel: 'بعد 6 ساعات', minutes: 360 },
  { value: 'custom', label: 'أخرى (تحديد وقت يدوي)', shortLabel: 'أخرى (يدوي)', minutes: 0 },
];

export function buildReminderSchedule(input: {
  preset: '30' | '60' | '120' | '180' | '240' | '360' | 'custom';
  customAmount?: number | string;
  customUnit?: 'minutes' | 'hours';
  targetShootId?: string | null;
  nowMs?: number;
}):
  | {
      ok: true;
      schedule: ReminderScheduleConfig;
    }
  | { ok: false; error: string } {
  const now = input.nowMs ?? Date.now();

  if (input.preset !== 'custom') {
    const found = REMINDER_PRESET_OPTIONS.find((o) => o.value === input.preset);
    const minutes = found ? found.minutes : 30;
    const label = found ? found.shortLabel : 'بعد نصف ساعة';
    return {
      ok: true,
      schedule: {
        preset: input.preset,
        intervalMinutes: minutes,
        label,
        targetShootId: input.targetShootId ?? null,
        nextTriggerAt: now + minutes * 60 * 1000,
      },
    };
  }

  const parsedAmount =
    typeof input.customAmount === 'number'
      ? input.customAmount
      : parseFloat(String(input.customAmount ?? '').trim());

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return {
      ok: false,
      error: 'يرجى إدخال وقت صحيح أكبر من صفر للتذكير اليدوي',
    };
  }

  const unit = input.customUnit || 'minutes';
  const intervalMinutes =
    unit === 'hours'
      ? Math.max(1, Math.round(parsedAmount * 60))
      : Math.max(1, Math.round(parsedAmount));
  const unitLabel =
    unit === 'hours'
      ? parsedAmount === 1
        ? 'ساعة'
        : parsedAmount === 2
        ? 'ساعتين'
        : `${parsedAmount} ساعات`
      : `${intervalMinutes} دقيقة`;

  return {
    ok: true,
    schedule: {
      preset: 'custom',
      intervalMinutes,
      customAmount: parsedAmount,
      customUnit: unit,
      label: `بعد ${unitLabel}`,
      targetShootId: input.targetShootId ?? null,
      nextTriggerAt: now + intervalMinutes * 60 * 1000,
    },
  };
}

export function isScheduledReminderDue(
  schedule: ReminderScheduleConfig | undefined,
  pendingActionRequired: number,
  nowMs: number
): boolean {
  if (pendingActionRequired <= 0) return false;
  if (!schedule || typeof schedule.nextTriggerAt !== 'number') return false;
  return nowMs >= schedule.nextTriggerAt;
}

export function findTargetNotificationShoot(
  shoots: ShootItem[],
  preferredShootId?: string | null
): ShootItem | null {
  if (!shoots || shoots.length === 0) return null;

  const activeShoots = shoots.filter((s) => s.status !== 'completed');
  if (activeShoots.length === 0) return null;

  if (preferredShootId) {
    const exact = activeShoots.find((s) => s.id === preferredShootId);
    if (exact) return exact;
  }

  const urgentPending = activeShoots.find((s) => s.status === 'pending' && s.isUrgent);
  if (urgentPending) return urgentPending;

  const anyPending = activeShoots.find((s) => s.status === 'pending');
  if (anyPending) return anyPending;

  const anyEditing = activeShoots.find((s) => s.status === 'editing');
  if (anyEditing) return anyEditing;

  return activeShoots[0] || null;
}
