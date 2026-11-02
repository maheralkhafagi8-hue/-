import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AiChatMessage,
  AppState,
  AudioTaskItem,
  INITIAL_COUNTER_CONFIG,
  IdeaItem,
  Photographer,
  ShootItem,
  ShootStatus,
} from '../types';
import {
  AdminDraftState,
  REMINDER_PRESET_OPTIONS,
  applyAdminDraftToState,
  buildReminderSchedule,
  calculatePhotographerStats,
  createAdminDraftFromState,
  createAudioTaskRecord,
  createIdeaRecord,
  createStartEditingNotification,
  filterShoots,
  findTargetNotificationShoot,
  generateSmartIdeaSuggestions,
  getPendingShootsCount,
} from '../utils/clacketLogic';
import { sendNativeMobileNotification } from '../utils/pwaNotifications';

export type DirectorTab = 'editTab' | 'ideasTab' | 'statsTab' | 'audioTab' | 'adminTab';

interface DirectorViewProps {
  state: AppState;
  focusShootRequest?: { shootId: string; nonce: number } | null;
  onUpdateState: (updater: (prev: AppState) => AppState, toastMsg?: string) => void;
  onShowToast: (msg: string, alsoSystemNotify?: boolean, targetShootId?: string | null) => void;
}

export const DirectorView: React.FC<DirectorViewProps> = ({
  state,
  focusShootRequest,
  onUpdateState,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<DirectorTab>('editTab');

  // Filtering in Editing Room
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ShootStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightedShootId, setHighlightedShootId] = useState<string | null>(null);

  // Controllable Reminder Time State
  const [reminderModalShoot, setReminderModalShoot] = useState<ShootItem | null>(null);
  const [showReminderSettingsPanel, setShowReminderSettingsPanel] = useState<boolean>(false);
  const [selectedPreset, setSelectedPreset] = useState<
    '30' | '60' | '120' | '180' | '240' | '360' | 'custom'
  >(state.reminderSchedule?.preset || '30');
  const [customReminderAmount, setCustomReminderAmount] = useState<string>(
    state.reminderSchedule?.customAmount ? String(state.reminderSchedule.customAmount) : '45'
  );
  const [customReminderUnit, setCustomReminderUnit] = useState<'minutes' | 'hours'>(
    state.reminderSchedule?.customUnit || 'minutes'
  );
  const [reminderTimeError, setReminderTimeError] = useState<string | null>(null);

  // Gemini AI Chat State
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome-ai',
      role: 'assistant',
      text: `أهلاً بك بالمونتاج! أنا مطّلع على مشاريعك (${state.projects.join('، ')}). اسألني عن أي فكرة مونتاج أو ترتيب لقطات.`,
      timestamp: 'الآن',
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSentPromptRef = useRef<string>('');
  const aiInputRef = useRef<HTMLInputElement | null>(null);

  // Ideas Vault & Program Suggestions State
  const [ideaProject, setIdeaProject] = useState<string>(state.projects[0] || '');
  const [ideaTitle, setIdeaTitle] = useState<string>('');
  const [ideaLink, setIdeaLink] = useState<string>('');
  const [ideaNotes, setIdeaNotes] = useState<string>('');
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [suggestionFilterProject, setSuggestionFilterProject] = useState<string>('all');

  // Audio Section Form State
  const [audioProject, setAudioProject] = useState<string>(state.projects[0] || '');
  const [audioTitle, setAudioTitle] = useState<string>('');
  const [audioArtist, setAudioArtist] = useState<string>('');
  const [audioScript, setAudioScript] = useState<string>('');
  const [audioLinkedShoot, setAudioLinkedShoot] = useState<string>('');
  const [audioError, setAudioError] = useState<string | null>(null);

  // Admin Settings Draft State (No auto-save; preserves spaces while typing)
  const [adminDraft, setAdminDraft] = useState<AdminDraftState>(() =>
    createAdminDraftFromState(state)
  );
  const [hasUnsavedAdminChanges, setHasUnsavedAdminChanges] = useState<boolean>(false);
  const [pendingTabSwitch, setPendingTabSwitch] = useState<DirectorTab | null>(null);

  const [newPhotogName, setNewPhotogName] = useState<string>('');
  const [newPhotogPin, setNewPhotogPin] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newCounterFieldName, setNewCounterFieldName] = useState<string>('');
  const [newDirectorAchLabel, setNewDirectorAchLabel] = useState<string>('');

  // Sync draft when external state updates ONLY if user has no unsaved edits
  useEffect(() => {
    if (!hasUnsavedAdminChanges) {
      setAdminDraft(createAdminDraftFromState(state));
    }
  }, [state, hasUnsavedAdminChanges]);

  // Navigate & scroll smoothly to a specific shoot card in #editTab
  const scrollAndHighlightShoot = useCallback(
    (preferredShootId?: string | null) => {
      const targetShoot = findTargetNotificationShoot(
        state.shoots,
        preferredShootId ?? state.activeReminderShootId
      );
      setActiveTab('editTab');
      setProjectFilter('all');
      setStatusFilter('all');
      setSearchQuery('');

      if (!targetShoot) return;

      setHighlightedShootId(targetShoot.id);
      window.setTimeout(() => {
        const el = document.getElementById(`shoot-card-${targetShoot.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);

      window.setTimeout(() => {
        setHighlightedShootId((curr) => (curr === targetShoot.id ? null : curr));
      }, 7000);
    },
    [state.shoots, state.activeReminderShootId]
  );

  // Respond to external focusShootRequest (e.g. clicking the live notification toast or ReminderPopup)
  useEffect(() => {
    if (focusShootRequest?.shootId) {
      scrollAndHighlightShoot(focusShootRequest.shootId);
    }
  }, [focusShootRequest, scrollAndHighlightShoot]);

  const pendingCounts = getPendingShootsCount(state.shoots);
  const filteredQueue = filterShoots(state.shoots, projectFilter, statusFilter, searchQuery);
  const photographerStats = calculatePhotographerStats(
    state.shoots,
    state.photographers,
    state.projects
  );
  const counterCfg = state.counterConfig || INITIAL_COUNTER_CONFIG;

  // Handlers
  const handleStatusChange = (shootId: string, newStatus: ShootStatus) => {
    const targetShoot = state.shoots.find((s) => s.id === shootId);
    if (!targetShoot) return;

    if (newStatus === 'editing') {
      const notif = createStartEditingNotification(
        targetShoot,
        state.config.directorName
      );
      sendNativeMobileNotification(
        `🎬 إشعار للمصور ${targetShoot.photographerName}`,
        notif.message,
        notif.id
      );
      onUpdateState(
        (prev) => ({
          ...prev,
          shoots: prev.shoots.map((s) =>
            s.id === shootId ? { ...s, status: 'editing' } : s
          ),
          photographerNotifications: [
            notif,
            ...(prev.photographerNotifications || []),
          ],
        }),
        `🎬 تم بدء المونتاج وإرسال إشعار إلى المصور (${targetShoot.photographerName}): "${notif.directorName} بدأ في العمل على هذا المشروع"`
      );
      return;
    }

    if (newStatus === 'completed') {
      const completedAtTime = new Date().toLocaleTimeString('ar-IQ', {
        hour: '2-digit',
        minute: '2-digit',
      });
      onUpdateState(
        (prev) => ({
          ...prev,
          shoots: prev.shoots.map((s) =>
            s.id === shootId
              ? { ...s, status: 'completed', completedAt: completedAtTime }
              : s
          ),
        }),
        `✅ تم إنجاز العمل ونقله إلى منجزات المصور (${targetShoot.photographerName}) ومنجزاتك الخاصة!`
      );
      return;
    }

    onUpdateState(
      (prev) => ({
        ...prev,
        shoots: prev.shoots.map((s) =>
          s.id === shootId ? { ...s, status: newStatus } : s
        ),
      }),
      '↩️ تمت إعادة العمل إلى طابور الانتظار'
    );
  };

  const handleOpenShootReminderModal = (shoot: ShootItem) => {
    setReminderTimeError(null);
    setReminderModalShoot(shoot);
  };

  const handleSaveReminderSchedule = (forShoot?: ShootItem | null) => {
    const targetShoot =
      forShoot ||
      reminderModalShoot ||
      findTargetNotificationShoot(state.shoots, state.activeReminderShootId);

    const res = buildReminderSchedule({
      preset: selectedPreset,
      customAmount: customReminderAmount,
      customUnit: customReminderUnit,
      targetShootId: targetShoot?.id ?? null,
    });

    if (!res.ok) {
      setReminderTimeError(res.error);
      return;
    }

    setReminderTimeError(null);
    const note = targetShoot
      ? `تذكير مونتاج (${res.schedule.label}) لمشروع (${targetShoot.project}) - المصور: ${targetShoot.photographerName} — "${targetShoot.field1Value}"`
      : `تذكير مهام المونتاج (${res.schedule.label})`;

    onUpdateState(
      (prev) => ({
        ...prev,
        activeReminder: note,
        activeReminderShootId: targetShoot?.id ?? prev.activeReminderShootId ?? null,
        reminderSchedule: res.schedule,
      }),
      `⏰ تم حفظ وقت التنبيه (${res.schedule.label}) — لن يظهر التنبيه إلا في الموعد المحدد!`
    );

    setReminderModalShoot(null);
    setShowReminderSettingsPanel(false);
  };

  const handleDeleteShoot = (shootId: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        shoots: prev.shoots.filter((s) => s.id !== shootId),
      }),
      '🗑️ تم حذف العمل من طابور المونتاج'
    );
  };

  // Counter adjustments in #statsTab
  const adjustDirectorAchievementCount = (itemId: string, delta: number) => {
    onUpdateState((prev) => {
      const cfg = prev.counterConfig || INITIAL_COUNTER_CONFIG;
      return {
        ...prev,
        counterConfig: {
          ...cfg,
          directorCustomItems: cfg.directorCustomItems.map((item) =>
            item.id === itemId
              ? { ...item, count: Math.max(0, item.count + delta) }
              : item
          ),
        },
      };
    });
  };

  const adjustPhotographerCustomFieldCount = (
    photogId: string,
    fieldId: string,
    delta: number
  ) => {
    onUpdateState((prev) => {
      const cfg = prev.counterConfig || INITIAL_COUNTER_CONFIG;
      const currentPhotogCounts = cfg.photographerCustomCounts[photogId] || {};
      const currentVal = currentPhotogCounts[fieldId] || 0;
      return {
        ...prev,
        counterConfig: {
          ...cfg,
          photographerCustomCounts: {
            ...cfg.photographerCustomCounts,
            [photogId]: {
              ...currentPhotogCounts,
              [fieldId]: Math.max(0, currentVal + delta),
            },
          },
        },
      };
    });
  };

  const stopAndEditAiTask = (customTextToEdit?: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setAiLoading(false);
    const textToRestore = (customTextToEdit ?? lastSentPromptRef.current).trim();
    if (textToRestore) {
      setAiInput(textToRestore);
    }
    setTimeout(() => {
      aiInputRef.current?.focus();
    }, 30);
    onShowToast('⏹️ تم إيقاف المهمة الحالية ووضع النص في الحقل لتعديله!');
  };

  const sendAiMsg = async (customPrompt?: string) => {
    const promptText = (customPrompt ?? aiInput).trim();
    if (!promptText) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    lastSentPromptRef.current = promptText;

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
    };
    setAiMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setAiInput('');
    setAiLoading(true);

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: promptText,
          projects: state.projects,
          pendingShoots: state.shoots.filter((s) => s.status !== 'completed'),
          ideas: state.ideas,
        }),
      });
      const data = await response.json();
      const replyText =
        data.reply ||
        data.error ||
        'تم استلام استفسارك. جرب البدء بلقطة جوية سريعة (Speed Ramp) ثم الانتقال للقطات التفصيلية.';

      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          text: '🎬 اقتراح سريع: ابدأ بهوك بصري خاطف (أول 3 ثوانٍ) من اللقطات الميدانية مع مؤثر صوتي Whoosh، ثم استعرض جماليات المشروع على إيقاع الموسيقى.',
          timestamp: 'الآن',
        },
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        setAiLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const exportToPersonalGemini = () => {
    const summaryText = `مشاريع كلاكيت فريم الحالية: ${state.projects.join('، ')}\nالأعمال في طابور المونتاج: ${state.shoots
      .map((s) => `${s.project} - ${s.field1Value}`)
      .join(' | ')}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(summaryText).catch(() => {});
    }
    onShowToast('📋 تم نسخ ملخص المشاريع واللقطات لاستخدامه في Gemini!');
  };

  const addNewIdea = (approveImmediately = false) => {
    const result = createIdeaRecord({
      project: ideaProject || state.projects[0] || 'عام',
      title: ideaTitle,
      link: ideaLink,
      notes: ideaNotes,
      approvedForPhotographers: approveImmediately,
      isSuggestedByApp: false,
    });

    if (!result.ok) {
      setIdeaError(result.error);
      return;
    }

    setIdeaError(null);
    setIdeaTitle('');
    setIdeaLink('');
    setIdeaNotes('');

    onUpdateState(
      (prev) => ({
        ...prev,
        ideas: [result.idea, ...prev.ideas],
      }),
      approveImmediately
        ? '✅ تم حفظ الفكرة والموافقة عليها لتظهر عند المصورين فوراً!'
        : '💡 تم حفظ الفكرة عندك في الخزنة (لن تظهر للمصورين إلا بعد موافقتك)'
    );
  };

  const approveIdeaForPhotographers = (ideaId: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        ideas: prev.ideas.map((item: IdeaItem) =>
          item.id === ideaId
            ? { ...item, approvedForPhotographers: true }
            : item
        ),
      }),
      '✅ تمت الموافقة على الفكرة! ظهرت الآن في حسابات المصورين.'
    );
  };

  const revokeIdeaFromPhotographers = (ideaId: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        ideas: prev.ideas.map((item: IdeaItem) =>
          item.id === ideaId
            ? { ...item, approvedForPhotographers: false }
            : item
        ),
      }),
      '🚫 تم إخفاء الفكرة عن المصورين وإعادتها إلى قائمة المراجعة الخاصة بك'
    );
  };

  const rejectAndReplaceIdea = (ideaId: string) => {
    const target = state.ideas.find((i) => i.id === ideaId);
    onUpdateState(
      (prev) => {
        const existingTitles = prev.ideas.map((i) => i.title);
        const replacement = generateSmartIdeaSuggestions(
          prev.projects,
          existingTitles,
          1,
          target?.project || suggestionFilterProject
        );
        return {
          ...prev,
          ideas: [
            ...replacement,
            ...prev.ideas.filter((item: IdeaItem) => item.id !== ideaId),
          ],
        };
      },
      '🗑️ تم حذف المقترح واستبداله بفكرة وزاوية تصوير جديدة من البرنامج!'
    );
  };

  const generateMoreIdeaSuggestions = (count = 3) => {
    onUpdateState(
      (prev) => {
        const existingTitles = prev.ideas.map((i) => i.title);
        const newSuggestions = generateSmartIdeaSuggestions(
          prev.projects,
          existingTitles,
          count,
          suggestionFilterProject
        );
        return {
          ...prev,
          ideas: [...newSuggestions, ...prev.ideas],
        };
      },
      `✨ قام البرنامج باقتراح (${count}) أفكار وزوايا تصوير جديدة للمراجعة!`
    );
  };

  const toggleIdeaCompleted = (ideaId: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        ideas: prev.ideas.map((item: IdeaItem) =>
          item.id === ideaId ? { ...item, isCompleted: !item.isCompleted } : item
        ),
      }),
      'تم تحديث حالة الفكرة في الخزنة'
    );
  };

  const deleteIdea = (ideaId: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        ideas: prev.ideas.filter((item: IdeaItem) => item.id !== ideaId),
      }),
      '🗑️ تم حذف الفكرة من الخزنة'
    );
  };

  const handleAddAudioTask = () => {
    const res = createAudioTaskRecord({
      project: audioProject || state.projects[0] || 'عام',
      title: audioTitle,
      voiceArtist: audioArtist,
      scriptText: audioScript,
      linkedShootId: audioLinkedShoot || undefined,
    });
    if (!res.ok) {
      setAudioError(res.error);
      return;
    }
    setAudioError(null);
    setAudioTitle('');
    setAudioArtist('');
    setAudioScript('');
    setAudioLinkedShoot('');

    onUpdateState(
      (prev) => ({
        ...prev,
        audioTasks: [res.task, ...prev.audioTasks],
      }),
      '🎙️ تم إضافة سكريبت التعليق الصوتي إلى قسم الصوت!'
    );
  };

  const handleAudioStatusChange = (
    taskId: string,
    status: AudioTaskItem['status']
  ) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        audioTasks: prev.audioTasks.map((t) =>
          t.id === taskId ? { ...t, status } : t
        ),
      }),
      '🎙️ تم تحديث حالة التسجيل الصوتي'
    );
  };

  const handleDeleteAudioTask = (taskId: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        audioTasks: prev.audioTasks.filter((t) => t.id !== taskId),
      }),
      '🗑️ تم حذف مهمة الصوت'
    );
  };

  const updateDraft = (updater: (prev: AdminDraftState) => AdminDraftState) => {
    setAdminDraft((prev) => updater(prev));
    setHasUnsavedAdminChanges(true);
  };

  const saveAllAdminChanges = () => {
    onUpdateState(
      (prev) => applyAdminDraftToState(prev, adminDraft),
      '✅ تم حفظ جميع التغييرات في الإعدادات بنجاح!'
    );
    setHasUnsavedAdminChanges(false);
  };

  const discardAllAdminChanges = () => {
    setAdminDraft(createAdminDraftFromState(state));
    setNewPhotogName('');
    setNewPhotogPin('');
    setNewProjectName('');
    setNewCounterFieldName('');
    setNewDirectorAchLabel('');
    setHasUnsavedAdminChanges(false);
    onShowToast('↩️ تم تجاهل التعديلات بدون حفظ');
  };

  const handleRequestTabSwitch = (targetTab: DirectorTab) => {
    if (activeTab === 'adminTab' && targetTab !== 'adminTab' && hasUnsavedAdminChanges) {
      setPendingTabSwitch(targetTab);
      return;
    }
    setActiveTab(targetTab);
  };

  const addPhotographerToDraft = () => {
    const name = newPhotogName.trim();
    const pin = newPhotogPin.trim() || '0000';
    if (!name) {
      onShowToast('⚠️ يرجى كتابة اسم المصور الجديد');
      return;
    }
    const newPhotog: Photographer = {
      id: `photog-${Date.now()}`,
      name,
      pin,
      specialty: 'مصور ميداني',
      faceIdEnabled: true,
    };
    setNewPhotogName('');
    setNewPhotogPin('');
    const nextDraft: AdminDraftState = {
      ...adminDraft,
      photographers: [...adminDraft.photographers, newPhotog],
    };
    setAdminDraft(nextDraft);
    onUpdateState(
      (prev) => applyAdminDraftToState(prev, nextDraft),
      `✅ تمت إضافة وحفظ المصور (${name}) بنجاح!`
    );
  };

  const updatePhotographerNameDraft = (photogId: string, rawName: string) => {
    updateDraft((prev) => ({
      ...prev,
      photographers: prev.photographers.map((p) =>
        p.id === photogId ? { ...p, name: rawName } : p
      ),
    }));
  };

  const updatePhotographerPinDraft = (photogId: string, rawPin: string) => {
    updateDraft((prev) => ({
      ...prev,
      photographers: prev.photographers.map((p) =>
        p.id === photogId ? { ...p, pin: rawPin } : p
      ),
    }));
  };

  const deletePhotographerFromDraft = (photogId: string) => {
    const nextDraft: AdminDraftState = {
      ...adminDraft,
      photographers: adminDraft.photographers.filter((p) => p.id !== photogId),
    };
    setAdminDraft(nextDraft);
    onUpdateState(
      (prev) => applyAdminDraftToState(prev, nextDraft),
      '🗑️ تم حذف المصور وحفظ التغيير'
    );
  };

  const updateProjectNameDraft = (projectIndex: number, rawName: string) => {
    updateDraft((prev) => ({
      ...prev,
      projects: prev.projects.map((item, idx) =>
        idx === projectIndex ? { ...item, currentName: rawName } : item
      ),
    }));
  };

  const addProjectToDraft = () => {
    const proj = newProjectName.trim();
    if (!proj) {
      onShowToast('⚠️ يرجى كتابة اسم المشروع الجديد');
      return;
    }
    if (adminDraft.projects.some((p) => p.currentName.trim() === proj)) {
      onShowToast('⚠️ هذا المشروع موجود مسبقاً');
      return;
    }
    setNewProjectName('');
    const nextDraft: AdminDraftState = {
      ...adminDraft,
      projects: [...adminDraft.projects, { originalName: proj, currentName: proj }],
    };
    setAdminDraft(nextDraft);
    onUpdateState(
      (prev) => applyAdminDraftToState(prev, nextDraft),
      `✅ تمت إضافة وحفظ مشروع (${proj}) بنجاح!`
    );
  };

  const deleteProjectFromDraft = (projectIndex: number) => {
    const nextDraft: AdminDraftState = {
      ...adminDraft,
      projects: adminDraft.projects.filter((_, idx) => idx !== projectIndex),
    };
    setAdminDraft(nextDraft);
    onUpdateState(
      (prev) => applyAdminDraftToState(prev, nextDraft),
      '🗑️ تم حذف المشروع وحفظ التغيير'
    );
  };

  const toggleAudioDepartmentDraft = () => {
    updateDraft((prev) => ({
      ...prev,
      enableAudioSection: !prev.enableAudioSection,
    }));
  };

  // Counter fields draft handlers in #adminTab
  const addCounterFieldToDraft = () => {
    const name = newCounterFieldName.trim();
    if (!name) {
      onShowToast('⚠️ يرجى كتابة اسم الخانة الجديدة للعداد');
      return;
    }
    setNewCounterFieldName('');
    updateDraft((prev) => ({
      ...prev,
      photographerCustomFields: [
        ...prev.photographerCustomFields,
        { id: `cfield-${Date.now()}`, name },
      ],
    }));
    onShowToast(`📊 تمت إضافة خانة (${name}) لعداد المصورين — اضغط "حفظ التغييرات" في الأسفل`);
  };

  const updateCounterFieldNameDraft = (fieldId: string, rawName: string) => {
    updateDraft((prev) => ({
      ...prev,
      photographerCustomFields: prev.photographerCustomFields.map((f) =>
        f.id === fieldId ? { ...f, name: rawName } : f
      ),
    }));
  };

  const deleteCounterFieldFromDraft = (fieldId: string) => {
    updateDraft((prev) => ({
      ...prev,
      photographerCustomFields: prev.photographerCustomFields.filter(
        (f) => f.id !== fieldId
      ),
    }));
  };

  const addDirectorAchievementToDraft = () => {
    const label = newDirectorAchLabel.trim();
    if (!label) {
      onShowToast('⚠️ يرجى كتابة اسم الخانة في وحدة منجزاتك الخاصة');
      return;
    }
    setNewDirectorAchLabel('');
    updateDraft((prev) => ({
      ...prev,
      directorCustomItems: [
        ...prev.directorCustomItems,
        { id: `dir-ach-${Date.now()}`, label, count: 0 },
      ],
    }));
    onShowToast(`🏆 تمت إضافة (${label}) إلى وحدة منجزاتك — اضغط "حفظ التغييرات" في الأسفل`);
  };

  const updateDirectorAchievementDraft = (
    itemId: string,
    rawLabel: string,
    countVal?: number
  ) => {
    updateDraft((prev) => ({
      ...prev,
      directorCustomItems: prev.directorCustomItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              label: rawLabel,
              count: countVal !== undefined ? Math.max(0, countVal) : item.count,
            }
          : item
      ),
    }));
  };

  const deleteDirectorAchievementFromDraft = (itemId: string) => {
    updateDraft((prev) => ({
      ...prev,
      directorCustomItems: prev.directorCustomItems.filter((i) => i.id !== itemId),
    }));
  };

  const currentScheduleLabel = state.reminderSchedule?.label || 'بعد نصف ساعة';

  return (
    <div id="directorView" className="space-y-5">
      {/* Unsaved Admin Changes Confirmation Modal */}
      {pendingTabSwitch && (
        <div
          id="unsavedAdminModal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md glass rounded-3xl p-6 border-2 border-amber-500 text-center space-y-4 shadow-2xl">
            <div className="text-4xl">⚠️</div>
            <h3 className="text-lg font-black text-white">
              لديك تعديلات غير محفوظة في الإعدادات!
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              قمت بتعديل بعض الأسماء أو الإعدادات ولم تضغط على حفظ. هل ترغب في حفظ التغييرات أم عدم الحفظ؟
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  saveAllAdminChanges();
                  const target = pendingTabSwitch;
                  setPendingTabSwitch(null);
                  setActiveTab(target);
                }}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs cursor-pointer"
              >
                💾 حفظ التغييرات
              </button>
              <button
                type="button"
                onClick={() => {
                  discardAllAdminChanges();
                  const target = pendingTabSwitch;
                  setPendingTabSwitch(null);
                  setActiveTab(target);
                }}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer"
              >
                ❌ عدم الحفظ
              </button>
              <button
                type="button"
                onClick={() => setPendingTabSwitch(null)}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                البقاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Setting / Controlling Shoot Reminder Time */}
      {reminderModalShoot && (
        <div
          id="reminderTimeModal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md glass rounded-3xl p-6 border-2 border-amber-500 text-right space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>⏰</span>
                <span>تحديد وقت إشعار التذكير لهذا العمل</span>
              </h3>
              <button
                type="button"
                onClick={() => setReminderModalShoot(null)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1">
              <div className="font-bold text-amber-400">
                🏢 {reminderModalShoot.project} — 📸 {reminderModalShoot.photographerName}
              </div>
              <div className="text-slate-300">{reminderModalShoot.field1Value}</div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                اختر متى يظهر لك إشعار التذكير:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {REMINDER_PRESET_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedPreset(opt.value)}
                    className={`py-2.5 px-3 rounded-xl font-bold transition cursor-pointer ${
                      selectedPreset === opt.value
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-500/50'
                    }`}
                  >
                    {opt.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {selectedPreset === 'custom' && (
              <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-amber-500/40 space-y-2">
                <label className="block text-xs font-bold text-amber-300">
                  ✍️ حدد الوقت بيدك:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="customReminderModalInput"
                    type="number"
                    min="1"
                    value={customReminderAmount}
                    onChange={(e) => setCustomReminderAmount(e.target.value)}
                    placeholder="مثلاً: 45 أو 5..."
                    className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-sm text-white text-center font-bold tabular-nums"
                  />
                  <select
                    id="customReminderModalUnit"
                    value={customReminderUnit}
                    onChange={(e) =>
                      setCustomReminderUnit(e.target.value as 'minutes' | 'hours')
                    }
                    className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold"
                  >
                    <option value="minutes">دقيقة</option>
                    <option value="hours">ساعة</option>
                  </select>
                </div>
              </div>
            )}

            {reminderTimeError && (
              <p role="alert" className="text-xs text-rose-400 font-bold">
                {reminderTimeError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSaveReminderSchedule(reminderModalShoot)}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer"
              >
                🔔 تفعيل وحفظ وقت التذكير
              </button>
              <button
                type="button"
                onClick={() => setReminderModalShoot(null)}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Pending Bar — Clicking navigates directly to the pending shoot item */}
      {pendingCounts.actionRequired > 0 && (
        <div
          id="stickyPendingBar"
          onClick={() => {
            if (activeTab === 'adminTab' && hasUnsavedAdminChanges) {
              setPendingTabSwitch('editTab');
              return;
            }
            scrollAndHighlightShoot();
          }}
          className="scroll-mt-24 p-3.5 rounded-2xl bg-rose-950/80 hover:bg-rose-900/80 border border-rose-500 pulse-red flex items-center justify-between gap-3 cursor-pointer transition group"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <div>
              <span
                id="stickyPendingText"
                className="text-xs sm:text-sm font-bold text-rose-200 block"
              >
                لديك ({pendingCounts.pending}) أعمال بانتظار المونتاج و ({pendingCounts.editing}) قيد العمل حالياً!
              </span>
              <span className="text-[11px] text-amber-300 font-semibold group-hover:underline">
                📍 اضغط هنا للانتقال مباشرة إلى مكان الإشعار والعمل المطلوب (التذكير: {currentScheduleLabel})
              </span>
            </div>
          </div>
          <button
            id="stickyOpenMontageBtn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (activeTab === 'adminTab' && hasUnsavedAdminChanges) {
                setPendingTabSwitch('editTab');
                return;
              }
              scrollAndHighlightShoot();
            }}
            className="text-xs bg-rose-500 group-hover:bg-rose-400 text-white px-3.5 py-2 rounded-xl font-bold transition cursor-pointer whitespace-nowrap shrink-0 shadow"
          >
            افتح المونتاج
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="أقسام غرفة المونتير">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'editTab'}
          onClick={() => handleRequestTabSwitch('editTab')}
          id="btn_editTab"
          className={`flex-1 py-3 px-4 rounded-2xl font-bold text-sm transition cursor-pointer whitespace-nowrap ${
            activeTab === 'editTab'
              ? 'bg-amber-500 text-slate-950 shadow-lg'
              : 'glass text-slate-300 hover:text-white'
          }`}
        >
          🎬 غرفة المونتاج والـ AI
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ideasTab'}
          onClick={() => handleRequestTabSwitch('ideasTab')}
          id="btn_ideasTab"
          className={`flex-1 py-3 px-4 rounded-2xl font-bold text-sm transition cursor-pointer whitespace-nowrap ${
            activeTab === 'ideasTab'
              ? 'bg-amber-500 text-slate-950 shadow-lg'
              : 'glass text-slate-300 hover:text-white'
          }`}
        >
          💡 خزنة أفكاري والروابط
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'statsTab'}
          onClick={() => handleRequestTabSwitch('statsTab')}
          id="btn_statsTab"
          className={`flex-1 py-3 px-4 rounded-2xl font-bold text-sm transition cursor-pointer whitespace-nowrap ${
            activeTab === 'statsTab'
              ? 'bg-amber-500 text-slate-950 shadow-lg'
              : 'glass text-slate-300 hover:text-white'
          }`}
        >
          📊 {counterCfg.tabTitle}
        </button>
        {state.config.enableAudioSection && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'audioTab'}
            onClick={() => handleRequestTabSwitch('audioTab')}
            id="btn_audioTab"
            className={`flex-1 py-3 px-4 rounded-2xl font-bold text-sm transition cursor-pointer whitespace-nowrap ${
              activeTab === 'audioTab'
                ? 'bg-amber-500 text-slate-950 shadow-lg'
                : 'glass text-slate-300 hover:text-white'
            }`}
          >
            🎙️ قسم الصوت
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'adminTab'}
          onClick={() => handleRequestTabSwitch('adminTab')}
          id="btn_adminTab"
          className={`flex-1 py-3 px-4 rounded-2xl font-bold text-sm transition cursor-pointer whitespace-nowrap ${
            activeTab === 'adminTab'
              ? 'bg-amber-500 text-slate-950 shadow-lg'
              : 'glass text-slate-300 hover:text-white'
          }`}
        >
          ⚙️ إدارة الأسماء والأقسام {hasUnsavedAdminChanges ? '●' : ''}
        </button>
      </div>

      {/* TAB 1: غرفة المونتاج والـ AI */}
      {activeTab === 'editTab' && (
        <div id="editTab" className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="glass rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-base text-white">
                  🎞️ طابور أعمال التصوير الجاهزة للمونتاج
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    id="toggleReminderScheduleBtn"
                    type="button"
                    onClick={() => setShowReminderSettingsPanel((prev) => !prev)}
                    className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap"
                  >
                    ⏰ وقت التنبيه: {currentScheduleLabel}
                  </button>
                  <a
                    id="directorTgBtn"
                    href={state.config.telegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap"
                  >
                    ✈️ كروب التلكرام
                  </a>
                </div>
              </div>

              {/* Inline Controllable Notification & Reminder Timing Bar */}
              {showReminderSettingsPanel && (
                <div
                  id="reminderSettingsBar"
                  className="p-3.5 rounded-2xl bg-slate-900/95 border border-amber-500/40 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-400">
                      🔔 التحكم بأوقات إشعارات التنبيه والتذكير للمونتاج:
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowReminderSettingsPanel(false)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      إغلاق ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {REMINDER_PRESET_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedPreset(opt.value)}
                        className={`py-2 px-2.5 rounded-xl font-bold transition cursor-pointer ${
                          selectedPreset === opt.value
                            ? 'bg-amber-500 text-slate-950 shadow'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {opt.shortLabel}
                      </button>
                    ))}
                  </div>

                  {selectedPreset === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 bg-slate-950/80 p-2.5 rounded-xl border border-amber-500/30">
                      <span className="text-amber-300 font-bold">✍️ وقت التذكير اليدوي:</span>
                      <input
                        id="inlineCustomReminderAmount"
                        type="number"
                        min="1"
                        value={customReminderAmount}
                        onChange={(e) => setCustomReminderAmount(e.target.value)}
                        placeholder="أدخل الرقم..."
                        className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-center font-bold tabular-nums"
                      />
                      <select
                        id="inlineCustomReminderUnit"
                        value={customReminderUnit}
                        onChange={(e) =>
                          setCustomReminderUnit(e.target.value as 'minutes' | 'hours')
                        }
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-amber-300 font-bold"
                      >
                        <option value="minutes">دقيقة</option>
                        <option value="hours">ساعة</option>
                      </select>
                    </div>
                  )}

                  {reminderTimeError && (
                    <p role="alert" className="text-rose-400 font-bold">
                      {reminderTimeError}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <button
                      id="saveReminderScheduleBtn"
                      type="button"
                      onClick={() => handleSaveReminderSchedule(null)}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2 rounded-xl transition cursor-pointer"
                    >
                      💾 حفظ وقت التنبيه ({selectedPreset === 'custom' ? `بعد ${customReminderAmount} ${customReminderUnit === 'hours' ? 'ساعة' : 'دقيقة'}` : REMINDER_PRESET_OPTIONS.find((o) => o.value === selectedPreset)?.shortLabel})
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Filter & Search Bar */}
            <div className="glass rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <select
                aria-label="تصفية حسب المشروع"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="all">
                  جميع المشاريع النشطة ({pendingCounts.actionRequired})
                </option>
                {state.projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              <select
                aria-label="تصفية حسب حالة المونتاج"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | ShootStatus)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="all">كل المهام النشطة</option>
                <option value="pending">⏳ بانتظار المونتاج</option>
                <option value="editing">🎬 جاري المونتاج</option>
              </select>

              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 ابحث باسم المصور أو اللقطة..."
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
            </div>

            {/* Editing Queue List */}
            <div id="editingQueueList" className="space-y-3">
              {filteredQueue.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center space-y-2">
                  <div className="text-3xl">🎬</div>
                  <p className="text-sm font-bold text-white">
                    لا توجد أعمال تصوير مطابقة للفلتر الحالي
                  </p>
                  <p className="text-xs text-slate-400">
                    بمجرد قيام المصورين بإرسال لقطات جديدة من الميدان ستظهر هنا فوراً مع تنبيه صوتي.
                  </p>
                </div>
              ) : (
                filteredQueue.map((shoot) => {
                  const isHighlighted = highlightedShootId === shoot.id;
                  return (
                    <div
                      id={`shoot-card-${shoot.id}`}
                      key={shoot.id}
                      className={`scroll-mt-24 glass rounded-2xl p-4 space-y-3 border transition-all duration-300 ${
                        isHighlighted
                          ? 'border-2 border-rose-500 ring-4 ring-rose-500/30 bg-rose-950/30 pulse-red'
                          : shoot.status === 'pending'
                          ? 'border-amber-500/40'
                          : shoot.status === 'editing'
                          ? 'border-sky-500/40'
                          : 'border-emerald-500/30 opacity-85'
                      }`}
                    >
                      {isHighlighted && (
                        <div className="flex items-center justify-between bg-rose-500/20 border border-rose-500/50 text-rose-200 px-3 py-1.5 rounded-xl text-xs font-black">
                          <span>📍 هذا هو العمل المطلوب في إشعار المونتاج!</span>
                          <button
                            type="button"
                            onClick={() => setHighlightedShootId(null)}
                            className="text-[11px] text-rose-300 hover:text-white cursor-pointer"
                          >
                            إخفاء التحديد ✕
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-amber-400">
                              🏢 {shoot.project}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className="text-xs font-bold text-white">
                              📸 {shoot.photographerName}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className="text-xs text-slate-400">{shoot.shotType}</span>
                            {shoot.isUrgent && (
                              <>
                                <span className="text-slate-600">·</span>
                                <span className="text-xs font-bold text-rose-400">
                                  🔥 عاجل
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                            وقت الإرسال: {shoot.createdAt}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                              shoot.status === 'pending'
                                ? 'bg-amber-500/20 text-amber-300'
                                : shoot.status === 'editing'
                                ? 'bg-sky-500/20 text-sky-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {shoot.status === 'pending'
                              ? '⏳ بانتظار المونتاج'
                              : shoot.status === 'editing'
                              ? '🎬 جاري المونتاج'
                              : '✅ مكتمل'}
                          </span>
                        </div>
                      </div>

                      <div className="bg-slate-900/80 rounded-xl p-3 space-y-1.5 text-xs border border-slate-800">
                        <div>
                          <span className="text-slate-400 font-semibold">
                            {state.config.field1Label}:{' '}
                          </span>
                          <span className="text-white font-bold">{shoot.field1Value}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold">
                            {state.config.field2Label}:{' '}
                          </span>
                          <span className="text-amber-300">{shoot.field2Value}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {shoot.status !== 'editing' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(shoot.id, 'editing')}
                              className="text-xs bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap"
                            >
                              🎬 بدء المونتاج
                            </button>
                          )}
                          {shoot.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(shoot.id, 'completed')}
                              className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap"
                            >
                              ✅ تم الإنجاز
                            </button>
                          )}
                          {shoot.status === 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(shoot.id, 'pending')}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap"
                            >
                              ↩️ إعادة للطابور
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              sendAiMsg(
                                `اقترح لي خطة مونتاج وسكريبت ريلز لمشروع (${shoot.project}) بناءً على لقطات المصور (${shoot.photographerName}): ${shoot.field1Value}`
                              )
                            }
                            className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2.5 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap"
                          >
                            ✨ فكرة مونتاج AI
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenShootReminderModal(shoot)}
                            title="تحديد وقت تذكير وتنبيه لهذا العمل"
                            className="text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 px-2.5 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap"
                          >
                            🔔 تذكير بوقت
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteShoot(shoot.id)}
                            aria-label={`حذف عمل ${shoot.project}`}
                            className="text-xs bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 px-2.5 py-1.5 rounded-xl transition cursor-pointer"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Gemini Smart Editing Assistant */}
          <div className="glass rounded-2xl p-4 flex flex-col h-[560px] border border-amber-500/30 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 mb-2.5 gap-2">
              <div>
                <h3 className="font-bold text-amber-400 text-sm">
                  ✨ مساعد المونتاج الذكي (Gemini)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  مفتوح حصرياً لك داخل غرفة المونتاج
                </p>
              </div>
              <button
                type="button"
                onClick={exportToPersonalGemini}
                className="text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2.5 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap shrink-0"
              >
                فتح حسابي Gemini ↗️
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 text-[11px]">
              <button
                type="button"
                onClick={() => sendAiMsg('اقترح لي هوك بصري خاطف (أول 3 ثوانٍ) لريلز مجمع ريحانة السكني')}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                ⚡ هوك أول 3 ثوانٍ
              </button>
              <button
                type="button"
                onClick={() => sendAiMsg('اكتب لي سكريبت تعليق صوتي إعلاني قصير لمشروع مجمع زمزم السكني')}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                🎙️ سكريبت صوتي
              </button>
              <button
                type="button"
                onClick={() => sendAiMsg('رتب لي تسلسل لقطات ريلز عائلي لمشروع ريحانة بارك')}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                🎞️ ترتيب اللقطات
              </button>
            </div>

            <div
              id="aiChatBox"
              className="flex-1 overflow-y-auto space-y-2.5 text-xs pr-1 mb-3"
            >
              {aiMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl leading-relaxed whitespace-pre-line ${
                    msg.role === 'assistant'
                      ? 'bg-slate-800/80 text-slate-200 border border-slate-700/60'
                      : 'bg-amber-500/20 text-amber-200 border border-amber-500/30 mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 gap-2">
                    <span className="font-bold">
                      {msg.role === 'assistant' ? '🤖 مساعد Gemini' : '🎬 أنت (المونتير)'}
                    </span>
                    <div className="flex items-center gap-2">
                      {msg.role === 'user' && (
                        <button
                          type="button"
                          onClick={() => stopAndEditAiTask(msg.text)}
                          className="text-[10px] bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md font-bold cursor-pointer"
                        >
                          ✏️ تعديل المهمة
                        </button>
                      )}
                      <span className="tabular-nums">{msg.timestamp}</span>
                    </div>
                  </div>
                  <div>{msg.text}</div>
                </div>
              ))}
              {aiLoading && (
                <div className="p-3 rounded-xl bg-slate-800/90 border border-rose-500/50 text-amber-300 text-xs flex items-center justify-between gap-2">
                  <span className="animate-pulse">
                    ✨ جاري العمل على المهمة وكتابة السكريبت...
                  </span>
                  <button
                    type="button"
                    onClick={() => stopAndEditAiTask()}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    ⏹️ إيقاف وتعديل
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                ref={aiInputRef}
                id="aiUserInput"
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendAiMsg();
                }}
                placeholder="اسأل عن فكرة مونتاج أو عدّل المهمة..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
              {aiLoading ? (
                <button
                  id="stopAiTaskBtn"
                  type="button"
                  onClick={() => stopAndEditAiTask()}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  ⏹️ إيقاف المهمة
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sendAiMsg()}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  إرسال
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: خزنة الأفكار ومقترحات البرنامج للمصورين */}
      {activeTab === 'ideasTab' && (
        <div id="ideasTab" className="space-y-5">
          {/* 1. Program Suggested Ideas & Angles (Only visible to Director until approved) */}
          <div
            id="programSuggestedIdeasSection"
            className="glass rounded-2xl p-5 space-y-4 border-2 border-amber-500/40 shadow-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-amber-400 flex items-center gap-2">
                  <span>🤖</span>
                  <span>
                    مقترحات البرنامج للأفكار والزوايا الميدانية (بانتظار موافقتك:{' '}
                    {state.ideas.filter((i) => !i.approvedForPhotographers).length})
                  </span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  هذه المقترحات تظهر عندك فقط ولا تظهر للمصورين إلا بعد ضغطك على &quot;موافقة وإظهار للمصورين&quot;. الفكرة التي لا تعجبك احذفها وسيقترح البرنامج غيرها.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="suggestionProjectSelect"
                  aria-label="المشروع للمقترحات الجديدة"
                  value={suggestionFilterProject}
                  onChange={(e) => setSuggestionFilterProject(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                >
                  <option value="all">جميع المشاريع</option>
                  {state.projects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  id="generateMoreSuggestionsBtn"
                  type="button"
                  onClick={() => generateMoreIdeaSuggestions(3)}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-slate-950 font-black px-4 py-2 rounded-xl text-xs shadow transition cursor-pointer whitespace-nowrap"
                >
                  🔄 أعطني مقترحات جديدة
                </button>
              </div>
            </div>

            {state.ideas.filter((i) => !i.approvedForPhotographers).length === 0 ? (
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
                <p className="text-xs text-slate-300 font-bold">
                  لا توجد مقترحات معلقة حالياً. اضغط الزر أدناه ليقوم البرنامج باقتراح أفكار وزوايا تصوير جديدة!
                </p>
                <button
                  type="button"
                  onClick={() => generateMoreIdeaSuggestions(3)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  ✨ توليد 3 مقترحات وزوايا جديدة الآن
                </button>
              </div>
            ) : (
              <div
                id="unapprovedIdeasList"
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                {state.ideas
                  .filter((i) => !i.approvedForPhotographers)
                  .map((idea) => (
                    <div
                      key={idea.id}
                      id={`suggested-idea-${idea.id}`}
                      className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-black text-amber-400">
                            🏢 {idea.project}
                          </span>
                          <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-lg font-bold">
                            🔒 تظهر عندك فقط (بانتظار موافقتك)
                          </span>
                        </div>
                        <h4 className="font-bold text-white text-sm leading-snug">
                          {idea.title}
                        </h4>
                        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                          {idea.notes}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
                        <button
                          id={`approveIdeaBtn-${idea.id}`}
                          type="button"
                          onClick={() => approveIdeaForPhotographers(idea.id)}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition cursor-pointer whitespace-nowrap"
                        >
                          ✅ موافقة وإظهار للمصورين
                        </button>
                        <button
                          id={`rejectReplaceIdeaBtn-${idea.id}`}
                          type="button"
                          onClick={() => rejectAndReplaceIdea(idea.id)}
                          className="py-2 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                        >
                          🗑️ حذف واقتراح بديل
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteIdea(idea.id)}
                          aria-label={`حذف فكرة ${idea.title}`}
                          title="حذف نهائي"
                          className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* 2. Approved Ideas Visible to Photographers */}
          <div
            id="approvedIdeasSection"
            className="glass rounded-2xl p-5 space-y-3 border border-emerald-500/30"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-black text-emerald-400">
                ✅ الأفكار والزوايا المعتمدة والظاهرة عند المصورين حالياً (
                {state.ideas.filter((i) => Boolean(i.approvedForPhotographers)).length})
              </h3>
              <span className="text-[11px] text-slate-400">
                هذه الأفكار وافقت عليها وتظهر الآن في حسابات المصورين
              </span>
            </div>

            {state.ideas.filter((i) => Boolean(i.approvedForPhotographers)).length ===
            0 ? (
              <p className="text-xs text-slate-400 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                لم توافق على أي فكرة بعد.. اختر من مقترحات البرنامج بالأعلى واضغط &quot;موافقة وإظهار للمصورين&quot; لتظهر في شاشة المصورين.
              </p>
            ) : (
              <div
                id="ideasVaultList"
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                {state.ideas
                  .filter((i) => Boolean(i.approvedForPhotographers))
                  .map((idea) => (
                    <div
                      key={idea.id}
                      id={`approved-idea-${idea.id}`}
                      className={`bg-slate-900/90 rounded-2xl p-4 space-y-2.5 border ${
                        idea.isCompleted
                          ? 'border-emerald-500/40 opacity-80'
                          : 'border-emerald-500/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold text-amber-400">
                            🏢 {idea.project}
                          </span>
                          <span className="text-slate-600 mx-1.5">·</span>
                          <span className="text-[11px] text-emerald-300 font-bold">
                            ✅ معتمدة للمصورين
                          </span>
                          <h4 className="font-bold text-white text-sm mt-1">
                            {idea.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => revokeIdeaFromPhotographers(idea.id)}
                            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2.5 py-1 rounded-lg font-bold cursor-pointer whitespace-nowrap"
                          >
                            🚫 إخفاء عن المصورين
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteIdea(idea.id)}
                            aria-label={`حذف فكرة ${idea.title}`}
                            className="text-xs bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 px-2 py-1 rounded-lg cursor-pointer"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                        {idea.notes}
                      </p>

                      {idea.link && (
                        <div className="pt-1">
                          <a
                            href={idea.link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-bold"
                          >
                            🔗 فتح فيديو المرجع (Reels / TikTok) ↗️
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* 3. Manual Idea Creation Form */}
          <div className="glass rounded-2xl p-5 space-y-3 border border-amber-500/20">
            <h3 className="font-bold text-amber-400 text-sm">
              ✍️ كتابة فكرة أو زاوية تصوير جديدة يدوياً
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                id="ideaProject"
                aria-label="مشروع الفكرة"
                value={ideaProject}
                onChange={(e) => setIdeaProject(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white"
              >
                {state.projects.map((proj) => (
                  <option key={proj} value={proj}>
                    {proj}
                  </option>
                ))}
              </select>
              <input
                id="ideaTitle"
                type="text"
                value={ideaTitle}
                onChange={(e) => setIdeaTitle(e.target.value)}
                placeholder="عنوان الفكرة أو الزاوية..."
                className="sm:col-span-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white"
              />
            </div>
            <input
              id="ideaLink"
              type="url"
              value={ideaLink}
              onChange={(e) => setIdeaLink(e.target.value)}
              placeholder="🔗 رابط ريلز انستاگرام أو تيك توك كمرجع (اختياري)..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white"
            />
            <textarea
              id="ideaNotes"
              rows={2}
              value={ideaNotes}
              onChange={(e) => setIdeaNotes(e.target.value)}
              placeholder="تفاصيل الفكرة أو اللقطات..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white"
            />
            {ideaError && (
              <p role="alert" className="text-xs text-rose-400 font-bold">
                {ideaError}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => addNewIdea(true)}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm transition cursor-pointer"
              >
                ✅ حفظ وموافقة فورية للمصورين
              </button>
              <button
                type="button"
                onClick={() => addNewIdea(false)}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm transition cursor-pointer"
              >
                💾 حفظ عندي في الخزنة أولاً (بدون إظهار للمصورين)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: عداد المصورين ووحدة منجزاتي الخاصة */}
      {activeTab === 'statsTab' && (
        <div id="statsTab" className="space-y-5">
          {/* Director's Personal Achievements Unit */}
          <div
            id="directorAchievementsCard"
            className="glass rounded-2xl p-5 border-2 border-amber-500/40 space-y-4 shadow-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
                  🏆
                </div>
                <div>
                  <h3
                    id="directorAchievementsTitle"
                    className="text-base font-black text-amber-400"
                  >
                    {counterCfg.directorCardTitle} — {state.config.directorName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    وحدة خاصة بمنجزاتك في المونتاج (يمكنك تعديل مسمياتها وإضافة خانات من إدارة الأسماء)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRequestTabSwitch('adminTab')}
                className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer"
              >
                ⚙️ تعديل خانات العداد ومنجزاتي
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800">
              <div>
                <div className="text-xl font-black text-emerald-400 tabular-nums">
                  {pendingCounts.completed}
                </div>
                <div className="text-xs text-slate-300 font-bold">مونتاج مكتمل ✅</div>
              </div>
              <div>
                <div className="text-xl font-black text-sky-400 tabular-nums">
                  {pendingCounts.editing}
                </div>
                <div className="text-xs text-slate-300 font-bold">قيد المونتاج 🎬</div>
              </div>
              <div>
                <div className="text-xl font-black text-amber-400 tabular-nums">
                  {state.shoots.length}
                </div>
                <div className="text-xs text-slate-300 font-bold">إجمالي المستلم 🎞️</div>
              </div>
            </div>

            {/* Director Custom Achievement Counters */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-300">
                خانات منجزاتي الخاصة:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {counterCfg.directorCustomItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between bg-slate-900/80 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs"
                  >
                    <span className="font-bold text-white">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustDirectorAchievementCount(item.id, -1)}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-black cursor-pointer"
                      >
                        -
                      </button>
                      <span className="text-sm font-black text-amber-400 w-7 text-center tabular-nums">
                        {item.count}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustDirectorAchievementCount(item.id, 1)}
                        className="w-7 h-7 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-black cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Completed Works List inside Director's Achievements */}
            <div
              id="directorCompletedShootsList"
              className="space-y-2 pt-3 border-t border-slate-800"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-emerald-400">
                  ✅ الأعمال المنجزة في المونتاج ({pendingCounts.completed}):
                </p>
                <span className="text-[11px] text-slate-400">
                  تنتقل هنا تلقائياً عند الضغط على "تم الإنجاز"
                </span>
              </div>
              {state.shoots.filter((s) => s.status === 'completed').length === 0 ? (
                <p className="text-xs text-slate-400 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  لا توجد أعمال منجزة حالياً.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {state.shoots
                    .filter((s) => s.status === 'completed')
                    .map((shoot) => (
                      <div
                        key={shoot.id}
                        className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-amber-400">
                            🏢 {shoot.project} · 📸 {shoot.photographerName}
                          </span>
                          <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-lg font-bold">
                            ✅ منجز
                          </span>
                        </div>
                        <p className="text-white font-semibold leading-relaxed">
                          {shoot.field1Value}
                        </p>
                        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                          <span>{shoot.shotType}</span>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(shoot.id, 'pending')}
                            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg font-bold cursor-pointer"
                          >
                            ↩️ إعادة للطابور
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Photographers Counter Grid */}
          <div id="directorStatsGrid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {photographerStats.map((st) => {
              const photogCompletedShoots = state.shoots.filter(
                (s) =>
                  s.status === 'completed' &&
                  (s.photographerId === st.photographer.id ||
                    s.photographerName === st.photographer.name)
              );
              return (
                <div
                  key={st.photographer.id}
                  className="glass rounded-2xl p-5 space-y-4 border border-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-white flex items-center gap-2">
                        <span>📸</span>
                        <span>{st.photographer.name}</span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        {st.photographer.specialty || 'مصور ميداني'}
                      </p>
                    </div>
                    <div className="text-left">
                      <div className="text-2xl font-black text-amber-400 tabular-nums">
                        {st.totalShoots}
                      </div>
                      <div className="text-[11px] text-slate-400">إجمالي التصوير</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <div>
                      <div className="text-sm font-black text-amber-300 tabular-nums">
                        {st.pendingCount}
                      </div>
                      <div className="text-[11px] text-slate-400">بانتظار المونتاج</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-sky-300 tabular-nums">
                        {st.editingCount}
                      </div>
                      <div className="text-[11px] text-slate-400">جاري المونتاج</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-emerald-400 tabular-nums">
                        {st.completedCount}
                      </div>
                      <div className="text-[11px] text-slate-400">مكتمل ({st.completionRate}%)</div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-slate-300">
                      توزيع التصوير حسب المشاريع:
                    </p>
                    <div className="space-y-1">
                      {state.projects.map((proj) => (
                        <div
                          key={proj}
                          className="flex items-center justify-between text-xs bg-slate-900/50 px-3 py-1.5 rounded-lg"
                        >
                          <span className="text-slate-300">{proj}</span>
                          <span className="font-bold text-amber-400 tabular-nums">
                            {st.projectBreakdown[proj] || 0} لقطات
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Completed Achievements per Photographer */}
                  {photogCompletedShoots.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <p className="text-xs font-bold text-emerald-400">
                        🏆 منجزات المصور المكتملة ({photogCompletedShoots.length}):
                      </p>
                      <div className="space-y-1.5">
                        {photogCompletedShoots.map((s) => (
                          <div
                            key={s.id}
                            className="bg-slate-900/80 border border-emerald-500/20 px-3 py-2 rounded-xl text-xs space-y-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-400">🏢 {s.project}</span>
                              <span className="text-[10px] text-emerald-300 font-bold">
                                ✅ مكتمل
                              </span>
                            </div>
                            <p className="text-slate-200">{s.field1Value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Counter Fields per Photographer */}
                  {counterCfg.photographerCustomFields.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <p className="text-xs font-bold text-amber-400">
                        خانات العداد المخصصة:
                      </p>
                      <div className="space-y-1.5">
                        {counterCfg.photographerCustomFields.map((field) => {
                          const fieldCount =
                            counterCfg.photographerCustomCounts?.[st.photographer.id]?.[
                              field.id
                            ] || 0;
                          return (
                            <div
                              key={field.id}
                              className="flex items-center justify-between text-xs bg-slate-900/80 border border-slate-800/80 px-3 py-2 rounded-xl"
                            >
                              <span className="text-slate-200 font-bold">{field.name}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    adjustPhotographerCustomFieldCount(
                                      st.photographer.id,
                                      field.id,
                                      -1
                                    )
                                  }
                                  className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="font-black text-amber-400 w-6 text-center tabular-nums">
                                  {fieldCount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    adjustPhotographerCustomFieldCount(
                                      st.photographer.id,
                                      field.id,
                                      1
                                    )
                                  }
                                  className="w-6 h-6 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: قسم الصوت والتعليق الصوتي */}
      {activeTab === 'audioTab' && state.config.enableAudioSection && (
        <div id="audioTab" className="space-y-4">
          <div className="glass rounded-2xl p-5 space-y-3 border border-amber-500/20">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-amber-400">
                🎙️ قسم الصوت والتعليق الصوتي (Voiceover Studio)
              </h3>
              <span className="text-xs text-slate-400 tabular-nums">
                إجمالي التسجيلات: {state.audioTasks.length}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              مجهز لإضافة المعلقين الصوتيين وربط التسجيلات بطابور المونتاج.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <select
                aria-label="المشروع الخاص بالتسجيل الصوتي"
                value={audioProject}
                onChange={(e) => setAudioProject(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white"
              >
                {state.projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={audioTitle}
                onChange={(e) => setAudioTitle(e.target.value)}
                placeholder="عنوان التسجيل الصوتي..."
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white"
              />
              <input
                type="text"
                value={audioArtist}
                onChange={(e) => setAudioArtist(e.target.value)}
                placeholder="اسم المعلق الصوتي..."
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white"
              />
            </div>

            <select
              aria-label="ربط مع عمل في طابور المونتاج"
              value={audioLinkedShoot}
              onChange={(e) => setAudioLinkedShoot(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white"
            >
              <option value="">🔗 ربط مع تصوير في طابور المونتاج (اختياري)...</option>
              {state.shoots.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.project}] {s.photographerName} — {s.field1Value.slice(0, 50)}
                </option>
              ))}
            </select>

            <textarea
              rows={2}
              value={audioScript}
              onChange={(e) => setAudioScript(e.target.value)}
              placeholder="اكتب نص السكريبت الصوتي هنا ليقرأه المعلق..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white"
            />

            {audioError && (
              <p role="alert" className="text-xs text-rose-400 font-bold">
                {audioError}
              </p>
            )}

            <button
              type="button"
              onClick={handleAddAudioTask}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer"
            >
              + إضافة تكليف صوتي جديد 🎙️
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {state.audioTasks.map((task) => (
              <div
                key={task.id}
                className="glass rounded-2xl p-4 space-y-3 border border-slate-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-amber-400">
                      🏢 {task.project}
                    </span>
                    <span className="text-slate-600 mx-1.5">·</span>
                    <span className="text-xs text-sky-300 font-semibold">
                      🎙️ {task.voiceArtist}
                    </span>
                    <h4 className="text-sm font-bold text-white mt-1">{task.title}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAudioTask(task.id)}
                    aria-label={`حذف التسجيل ${task.title}`}
                    className="text-xs bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 px-2 py-1 rounded-lg cursor-pointer"
                  >
                    🗑️
                  </button>
                </div>

                <p className="text-xs text-slate-200 bg-slate-900/80 p-3 rounded-xl border border-slate-800 leading-relaxed">
                  "{task.scriptText}"
                </p>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {task.createdAt}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAudioStatusChange(task.id, 'waiting')}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                        task.status === 'waiting'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      ⏳ بانتظار التسجيل
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAudioStatusChange(task.id, 'recorded')}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                        task.status === 'recorded'
                          ? 'bg-sky-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      🎙️ تم التسجيل
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAudioStatusChange(task.id, 'merged')}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                        task.status === 'merged'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      ✅ دُمج بالمونتاج
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: إدارة الأسماء والأقسام */}
      {activeTab === 'adminTab' && (
        <div id="adminTab" className="space-y-5">
          {/* Cloud URL Card */}
          <div className="glass rounded-2xl p-5 border-2 border-emerald-500/40 space-y-3">
            <h3 className="font-bold text-emerald-400 text-base">
              🌐 ربط الإشعارات الحية عبر الإنترنت
            </h3>
            <div className="flex gap-2">
              <input
                id="firebaseUrlInput"
                type="url"
                dir="ltr"
                value={adminDraft.firebaseUrl}
                onChange={(e) =>
                  updateDraft((prev) => ({ ...prev, firebaseUrl: e.target.value }))
                }
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-emerald-400 font-bold"
              />
              <button
                type="button"
                onClick={saveAllAdminChanges}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer whitespace-nowrap"
              >
                تحديث وحفظ الرابط
              </button>
            </div>
          </div>

          {/* General App Names & Config */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-amber-400">
              ✏️ التحكم بأسماء التطبيق، الخانات، ورسالة الترحيب
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="cfgAppName" className="text-slate-400 block mb-1">
                  اسم التطبيق الرئيسي:
                </label>
                <input
                  id="cfgAppName"
                  type="text"
                  value={adminDraft.appName}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, appName: e.target.value }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label htmlFor="cfgDirectorName" className="text-slate-400 block mb-1">
                  اسم خانتك الخاصة + الرمز السري:
                </label>
                <div className="flex gap-2">
                  <input
                    id="cfgDirectorName"
                    type="text"
                    value={adminDraft.directorName}
                    onChange={(e) =>
                      updateDraft((prev) => ({ ...prev, directorName: e.target.value }))
                    }
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                  <input
                    id="cfgDirectorPin"
                    aria-label="الرمز السري للمونتير"
                    type="text"
                    value={adminDraft.directorPin}
                    onChange={(e) =>
                      updateDraft((prev) => ({ ...prev, directorPin: e.target.value }))
                    }
                    className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-amber-400 font-bold font-mono tabular-nums"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="cfgWelcomeQuote" className="text-slate-400 block mb-1">
                  رسالة الترحيب في واجهة الدخول:
                </label>
                <input
                  id="cfgWelcomeQuote"
                  type="text"
                  value={adminDraft.welcomeQuote}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, welcomeQuote: e.target.value }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label htmlFor="cfgField1Label" className="text-slate-400 block mb-1">
                  عنوان الحقل الأول للمصور:
                </label>
                <input
                  id="cfgField1Label"
                  type="text"
                  value={adminDraft.field1Label}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, field1Label: e.target.value }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label htmlFor="cfgField2Label" className="text-slate-400 block mb-1">
                  عنوان الحقل الثاني للمصور:
                </label>
                <input
                  id="cfgField2Label"
                  type="text"
                  value={adminDraft.field2Label}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, field2Label: e.target.value }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="cfgTelegramUrl" className="text-slate-400 block mb-1">
                  رابط كروب التلكرام:
                </label>
                <input
                  id="cfgTelegramUrl"
                  type="url"
                  dir="ltr"
                  value={adminDraft.telegramUrl}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, telegramUrl: e.target.value }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>
          </div>

          {/* Photographers Management */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-amber-400">
              📸 إدارة الأخوة المصورين والرموز السرية (تعديل الاسم والرمز بحرية مع المسافات)
            </h3>
            <div id="adminPhotographersList" className="space-y-2">
              {adminDraft.photographers.map((photog, idx) => (
                <div
                  key={photog.id}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                    <span>📸</span>
                    <input
                      type="text"
                      aria-label={`اسم المصور ${idx + 1}`}
                      value={photog.name}
                      onChange={(e) =>
                        updatePhotographerNameDraft(photog.id, e.target.value)
                      }
                      placeholder="اكتب اسم المصور..."
                      className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-1.5 font-bold text-white focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-slate-400 text-[11px]">الرمز:</label>
                    <input
                      type="text"
                      aria-label={`رمز المصور ${idx + 1}`}
                      value={photog.pin}
                      onChange={(e) =>
                        updatePhotographerPinDraft(photog.id, e.target.value)
                      }
                      className="w-20 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1.5 text-center text-amber-400 font-mono tabular-nums focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => deletePhotographerFromDraft(photog.id)}
                      aria-label={`حذف المصور ${photog.name}`}
                      className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap sm:flex-nowrap gap-2 pt-2">
              <input
                id="newPhotogName"
                type="text"
                value={newPhotogName}
                onChange={(e) => setNewPhotogName(e.target.value)}
                placeholder="اسم المصور الجديد..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <input
                id="newPhotogPin"
                type="text"
                value={newPhotogPin}
                onChange={(e) => setNewPhotogPin(e.target.value)}
                placeholder="رمزه (0000)"
                className="w-32 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-center text-white font-mono tabular-nums"
              />
              <button
                type="button"
                onClick={addPhotographerToDraft}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer whitespace-nowrap"
              >
                + إضافة مصور
              </button>
            </div>
          </div>

          {/* Projects & Audio Section Management */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-amber-400">
              🏢 إدارة وتعديل أسماء المشاريع (المجمعات والبارك) وقسم الصوت
            </h3>
            <div id="adminProjectsList" className="space-y-2">
              {adminDraft.projects.map((projItem, idx) => (
                <div
                  key={`proj-draft-${idx}`}
                  className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <span>🏢</span>
                    <input
                      type="text"
                      aria-label={`تعديل اسم المشروع ${idx + 1}`}
                      value={projItem.currentName}
                      onChange={(e) => updateProjectNameDraft(idx, e.target.value)}
                      placeholder="اسم المشروع أو البارك..."
                      className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-1.5 font-bold text-white focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => deleteProjectFromDraft(idx)}
                      aria-label={`حذف مشروع ${projItem.currentName}`}
                      className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <input
                id="newProjectName"
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="إضافة مشروع جديد..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={addProjectToDraft}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer whitespace-nowrap"
              >
                + إضافة مشروع
              </button>
            </div>
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-300">
                تفعيل قسم الصوت والتعليق الصوتي في شريط المونتير:
              </span>
              <button
                type="button"
                onClick={toggleAudioDepartmentDraft}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  adminDraft.enableAudioSection
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {adminDraft.enableAudioSection ? 'مفعّل 🎙️' : 'مخفي 🔇'}
              </button>
            </div>
          </div>

          {/* Photographers Counter & Director Personal Achievements Control */}
          <div id="adminCounterControlSection" className="glass rounded-2xl p-5 space-y-4 border border-amber-500/30">
            <h3 className="font-bold text-amber-400 text-base">
              📊 التحكم بعداد المصورين ووحدة منجزاتي الخاصة
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="cfgCounterTabTitle" className="text-slate-400 block mb-1">
                  اسم قسم العداد في الشريط العلوي:
                </label>
                <input
                  id="cfgCounterTabTitle"
                  type="text"
                  value={adminDraft.counterTabTitle}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      counterTabTitle: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                />
              </div>

              <div>
                <label htmlFor="cfgDirectorCardTitle" className="text-slate-400 block mb-1">
                  عنوان وحدة منجزاتي الخاصة:
                </label>
                <input
                  id="cfgDirectorCardTitle"
                  type="text"
                  value={adminDraft.directorCardTitle}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      directorCardTitle: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                />
              </div>
            </div>

            {/* Custom Counter Fields inside Photographers Counter */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <p className="text-xs font-bold text-slate-200">
                📸 خانات عداد المصورين (إضافة خانة داخل العداد أو تغيير اسمها):
              </p>
              <div id="adminCounterFieldsList" className="space-y-2">
                {adminDraft.photographerCustomFields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs"
                  >
                    <span className="text-amber-400">📊</span>
                    <input
                      type="text"
                      aria-label={`اسم خانة العداد ${idx + 1}`}
                      value={field.name}
                      onChange={(e) =>
                        updateCounterFieldNameDraft(field.id, e.target.value)
                      }
                      placeholder="اسم الخانة داخل العداد..."
                      className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-1.5 font-bold text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => deleteCounterFieldFromDraft(field.id)}
                      className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap"
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  id="newCounterFieldInput"
                  type="text"
                  value={newCounterFieldName}
                  onChange={(e) => setNewCounterFieldName(e.target.value)}
                  placeholder="اسم خانة جديدة داخل عداد المصورين..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <button
                  id="addCounterFieldBtn"
                  type="button"
                  onClick={addCounterFieldToDraft}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer whitespace-nowrap"
                >
                  + إضافة خانة للعداد
                </button>
              </div>
            </div>

            {/* Director Personal Achievements Fields */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <p className="text-xs font-bold text-amber-300">
                🏆 خانات وحدة منجزاتي الخاصة (إضافة أو تعديل مسمى وأرقام منجزاتك):
              </p>
              <div id="adminDirectorAchievementsList" className="space-y-2">
                {adminDraft.directorCustomItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs"
                  >
                    <span className="text-amber-400">🏆</span>
                    <input
                      type="text"
                      aria-label={`اسم منجز ${idx + 1}`}
                      value={item.label}
                      onChange={(e) =>
                        updateDirectorAchievementDraft(item.id, e.target.value)
                      }
                      placeholder="اسم المنجز الخاص بك..."
                      className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-1.5 font-bold text-white focus:outline-none"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-slate-400 text-[11px]">العدد:</label>
                      <input
                        type="number"
                        min="0"
                        value={item.count}
                        onChange={(e) =>
                          updateDirectorAchievementDraft(
                            item.id,
                            item.label,
                            parseInt(e.target.value || '0', 10)
                          )
                        }
                        className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-amber-400 font-bold tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => deleteDirectorAchievementFromDraft(item.id)}
                        className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  id="newDirectorAchInput"
                  type="text"
                  value={newDirectorAchLabel}
                  onChange={(e) => setNewDirectorAchLabel(e.target.value)}
                  placeholder="إضافة خانة جديدة في وحدة منجزاتي..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <button
                  id="addDirectorAchBtn"
                  type="button"
                  onClick={addDirectorAchievementToDraft}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer whitespace-nowrap"
                >
                  + إضافة لمنجزاتي
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Save / Discard Bar (Discard button text is strictly "عدم الحفظ") */}
          <div className="glass rounded-2xl p-4 border-2 border-amber-500/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white font-black">
                  ⚙️ حفظ أو عدم حفظ التعديلات:
                </span>
                {hasUnsavedAdminChanges ? (
                  <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-lg font-bold">
                    لديك تعديلات غير محفوظة ●
                  </span>
                ) : (
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-lg font-bold">
                    جميع الإعدادات محفوظة ✓
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                بعد الانتهاء من كتابة الأسماء أو تعديل الإعدادات، اختر حفظ التغييرات أو عدم الحفظ:
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                id="btnSaveAllAdmin"
                type="button"
                onClick={saveAllAdminChanges}
                className="flex-1 sm:flex-initial py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm transition cursor-pointer whitespace-nowrap shadow-lg"
              >
                💾 حفظ التغييرات ✅
              </button>
              <button
                id="btnDiscardAllAdmin"
                type="button"
                onClick={discardAllAdminChanges}
                className="flex-1 sm:flex-initial py-3 px-5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap"
              >
                ❌ عدم الحفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
