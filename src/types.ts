export type ShootStatus = 'pending' | 'editing' | 'completed';

export interface Photographer {
  id: string;
  name: string;
  pin: string;
  specialty?: string;
  faceIdEnabled?: boolean;
}

export interface ShootItem {
  id: string;
  project: string;
  photographerId: string;
  photographerName: string;
  field1Value: string; // موضوع التصوير / تفاصيل اللقطات
  field2Value: string; // ملاحظات الميدان / رقم الذاكرة أو الرابط
  shotType: string;    // ريلز عمودي، درون، تغطية هندسية، لقاء
  status: ShootStatus;
  createdAt: string;
  completedAt?: string;
  isUrgent?: boolean;
  reminderNote?: string;
  editorNotes?: string;
  audioStatus?: 'none' | 'waiting_vo' | 'recorded';
}

export interface PhotographerNotification {
  id: string;
  photographerId: string;
  photographerName: string;
  shootId: string;
  project: string;
  shootTitle: string;
  directorName: string;
  message: string;
  createdAt: string;
  timestamp: number;
  read?: boolean;
}

export interface IdeaItem {
  id: string;
  project: string;
  title: string;
  link?: string;
  notes: string;
  createdAt: string;
  isCompleted?: boolean;
  approvedForPhotographers?: boolean;
  isSuggestedByApp?: boolean;
}

export interface AudioTaskItem {
  id: string;
  project: string;
  title: string;
  voiceArtist: string;
  scriptText: string;
  status: 'waiting' | 'recorded' | 'merged';
  linkedShootId?: string;
  createdAt: string;
}

export interface AppConfig {
  appName: string;
  directorName: string;
  directorPin: string;
  directorFaceIdEnabled?: boolean;
  welcomeQuote: string;
  field1Label: string;
  field2Label: string;
  telegramUrl: string;
  firebaseUrl: string;
  enableAudioSection: boolean;
}

export interface ReminderScheduleConfig {
  preset: '30' | '60' | '120' | '180' | '240' | '360' | 'custom';
  intervalMinutes: number;
  customAmount?: number;
  customUnit?: 'minutes' | 'hours';
  label: string;
  targetShootId?: string | null;
  nextTriggerAt?: number | null;
}

export interface CustomCounterField {
  id: string;
  name: string;
}

export interface DirectorAchievementItem {
  id: string;
  label: string;
  count: number;
}

export interface CounterConfig {
  tabTitle: string;
  directorCardTitle: string;
  directorCustomItems: DirectorAchievementItem[];
  photographerCustomFields: CustomCounterField[];
  photographerCustomCounts: Record<string, Record<string, number>>;
}

export interface AppState {
  config: AppConfig;
  projects: string[];
  photographers: Photographer[];
  shoots: ShootItem[];
  ideas: IdeaItem[];
  audioTasks: AudioTaskItem[];
  photographerNotifications?: PhotographerNotification[];
  activeReminder: string | null;
  activeReminderShootId?: string | null;
  reminderSchedule?: ReminderScheduleConfig;
  counterConfig?: CounterConfig;
  lastUpdated: number;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export const INITIAL_COUNTER_CONFIG: CounterConfig = {
  tabTitle: 'عداد المصورين ومنجزاتي',
  directorCardTitle: 'وحدة منجزاتي الخاصة (المونتير)',
  directorCustomItems: [
    { id: 'dir-ach-1', label: 'ريلز إعلاني تم مونتاجه ونشره', count: 4 },
    { id: 'dir-ach-2', label: 'فيديوهات تغطية شاملة ومؤثرات', count: 2 },
  ],
  photographerCustomFields: [
    { id: 'cfield-1', name: 'لقطات ريلز إبداعية' },
    { id: 'cfield-2', name: 'تغطية درون جوية' },
  ],
  photographerCustomCounts: {},
};

export const INITIAL_APP_STATE: AppState = {
  config: {
    appName: 'كلاكيت فريم',
    directorName: 'المونتير ماهر',
    directorPin: '1234',
    directorFaceIdEnabled: true,
    welcomeQuote: '✨ أهلاً بأبطال الميدان.. كل لقطة حلوة منكم تصنع فرق!',
    field1Label: 'تفاصيل اللقطات الميدانية / موضوع التصوير',
    field2Label: 'ملاحظات للمونتير / رقم الذاكرة أو رابط التلكرام',
    telegramUrl: 'https://t.me/clacket_frame_team',
    firebaseUrl: 'https://clacket-frame-default-rtdb.firebaseio.com',
    enableAudioSection: true,
  },
  projects: [
    'مجمع ريحانة السكني',
    'مجمع زمزم السكني',
    'ريحانة بارك',
  ],
  photographers: [],
  shoots: [],
  ideas: [
    {
      id: 'idea-201',
      project: 'مجمع ريحانة السكني',
      title: 'ترند الانتقال السريع (Match Cut) من المخطط الهندسي إلى الواقع',
      link: 'https://www.instagram.com/reels/',
      notes: 'تبدأ اللقطة بيد المهندس يمسك الآيباد على المخطط ثم حركة كاميرا سريعة تكشف البناية الحقيقية المكتملة بنفس الزاوية.',
      createdAt: '2026-10-30',
      isCompleted: false,
      approvedForPhotographers: false,
      isSuggestedByApp: true,
    },
    {
      id: 'idea-202',
      project: 'ريحانة بارك',
      title: 'تجربة المشي الصباحي (POV) وسط الحدائق والنافورات',
      link: 'https://www.tiktok.com/',
      notes: 'تصوير بزاوية واسعة 16mm مع أصوات طبيعية (ASMR) للمياه والأشجار بدون موسيقى صاخبة في أول 5 ثواني.',
      createdAt: '2026-10-31',
      isCompleted: false,
      approvedForPhotographers: false,
      isSuggestedByApp: true,
    },
    {
      id: 'idea-203',
      project: 'مجمع زمزم السكني',
      title: 'لقطة درون عمودية (Top-Down 90°) تكشف تناسق الأبراج السكنية وقت الغروب',
      link: '',
      notes: 'ارتفاع تدريجي من 15 متر إلى 80 متر مع تشغيل الإضاءة الليلية للمجمع لعمل Speed Ramp سينمائي.',
      createdAt: '2026-11-01',
      isCompleted: false,
      approvedForPhotographers: false,
      isSuggestedByApp: true,
    },
    {
      id: 'idea-204',
      project: 'مجمع ريحانة السكني',
      title: 'جولة One-Take مستمرة من بوابة المجمع إلى داخل صالة الفيلا النموذجية',
      link: '',
      notes: 'استخدام مثبت Gimbal بحركة سلسة للأمام مع فتح الباب في الثانية الثالثة كـ Hook بصري خاطف.',
      createdAt: '2026-11-01',
      isCompleted: false,
      approvedForPhotographers: false,
      isSuggestedByApp: true,
    },
  ],
  audioTasks: [],
  photographerNotifications: [],
  activeReminder: null,
  activeReminderShootId: null,
  reminderSchedule: {
    preset: '30',
    intervalMinutes: 30,
    label: 'بعد نصف ساعة',
    targetShootId: null,
    nextTriggerAt: null,
  },
  counterConfig: INITIAL_COUNTER_CONFIG,
  lastUpdated: 0,
};
