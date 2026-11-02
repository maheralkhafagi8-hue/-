import test from 'node:test';
import assert from 'node:assert/strict';
import { AppState, INITIAL_APP_STATE } from '../types';
import {
  verifyAccountPin,
  getPendingShootsCount,
  calculatePhotographerStats,
  createShootRecord,
  createIdeaRecord,
  filterShoots,
  renamePhotographerInState,
  renameProjectInState,
  createAdminDraftFromState,
  applyAdminDraftToState,
  buildReminderSchedule,
  findTargetNotificationShoot,
  isScheduledReminderDue,
  normalizeAppState,
  createStartEditingNotification,
  generateSmartIdeaSuggestions,
  updatePhotographerSelfCredentials,
  authenticateUserByCredentials,
} from './clacketLogic';

const TEST_FIXTURE_STATE: AppState = {
  ...INITIAL_APP_STATE,
  photographers: [
    { id: 'p-1', name: 'بلال المصور', pin: '1111', specialty: 'ريلز', faceIdEnabled: true },
    { id: 'p-2', name: 'كرار المصور', pin: '2222', specialty: 'درون', faceIdEnabled: true },
    { id: 'p-3', name: 'محمد المصور', pin: '3333', specialty: 'ميداني', faceIdEnabled: true },
  ],
  shoots: [
    {
      id: 's-1',
      project: 'مجمع ريحانة السكني',
      photographerId: 'p-1',
      photographerName: 'بلال المصور',
      field1Value: 'جولة داخل الفيلا النموذجية',
      field2Value: 'مجلد A01',
      shotType: 'ريلز عمودي 9:16',
      status: 'pending',
      createdAt: '10:30 ص',
      isUrgent: true,
    },
    {
      id: 's-2',
      project: 'مجمع زمزم السكني',
      photographerId: 'p-2',
      photographerName: 'كرار المصور',
      field1Value: 'لقطات جوية للأبراج',
      field2Value: 'كارت 2',
      shotType: 'تصوير درون جوي',
      status: 'editing',
      createdAt: '09:15 ص',
      isUrgent: false,
    },
    {
      id: 's-3',
      project: 'ريحانة بارك',
      photographerId: 'p-3',
      photographerName: 'محمد المصور',
      field1Value: 'تغطية المساحات الخضراء',
      field2Value: 'التلكرام',
      shotType: 'لقاء وتغطية ميدانية',
      status: 'completed',
      createdAt: '04:45 م',
      isUrgent: false,
    },
  ],
};

test('verifyAccountPin validates director and photographer PINs accurately', () => {
  const dirOk = verifyAccountPin(TEST_FIXTURE_STATE, 'director', '199400');
  assert.equal(dirOk.valid, true);
  assert.equal(dirOk.role, 'director');

  const dirBad = verifyAccountPin(TEST_FIXTURE_STATE, 'director', '9999');
  assert.equal(dirBad.valid, false);

  const photogOk = verifyAccountPin(TEST_FIXTURE_STATE, 'p-1', '1111');
  assert.equal(photogOk.valid, true);
  assert.equal(photogOk.role, 'photographer');
  assert.equal(photogOk.photographer?.name, 'بلال المصور');
});

test('getPendingShootsCount calculates pending and editing queues', () => {
  const counts = getPendingShootsCount(TEST_FIXTURE_STATE.shoots);
  assert.equal(counts.pending, 1);
  assert.equal(counts.editing, 1);
  assert.equal(counts.actionRequired, 2);
});

test('createShootRecord enforces required inputs and builds valid record', () => {
  const photog = TEST_FIXTURE_STATE.photographers[0];
  const invalid = createShootRecord(
    { project: 'مجمع ريحانة السكني', field1Value: '', field2Value: 'مجلد 1' },
    photog
  );
  assert.equal(invalid.ok, false);

  const valid = createShootRecord(
    {
      project: 'مجمع ريحانة السكني',
      field1Value: 'تصوير الواجهات الأمامية',
      field2Value: 'مرفوع على التلكرام',
      shotType: 'ريلز عمودي 9:16',
      isUrgent: true,
    },
    photog,
    '12:00 م'
  );
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.shoot.photographerName, 'بلال المصور');
    assert.equal(valid.shoot.status, 'pending');
    assert.equal(valid.shoot.isUrgent, true);
  }
});

test('createIdeaRecord validates required fields', () => {
  const emptyTitle = createIdeaRecord({ project: 'ريحانة بارك', title: '   ' });
  assert.equal(emptyTitle.ok, false);

  const goodIdea = createIdeaRecord({
    project: 'ريحانة بارك',
    title: 'زاوية درون عمودية للنافورة',
    link: 'https://instagram.com/p/123',
    notes: 'وقت الغروب',
  });
  assert.equal(goodIdea.ok, true);
});

test('calculatePhotographerStats aggregates per-project counts', () => {
  const stats = calculatePhotographerStats(
    TEST_FIXTURE_STATE.shoots,
    TEST_FIXTURE_STATE.photographers,
    TEST_FIXTURE_STATE.projects
  );
  assert.equal(stats.length, 3);
  assert.equal(stats[0].totalShoots, 1);
  assert.equal(stats[0].projectBreakdown['مجمع ريحانة السكني'], 1);
});

test('filterShoots filters by project, status, and search query', () => {
  const pendingOnly = filterShoots(TEST_FIXTURE_STATE.shoots, 'all', 'pending', '');
  assert.equal(pendingOnly.length, 1);

  const byProject = filterShoots(TEST_FIXTURE_STATE.shoots, 'مجمع زمزم السكني', 'all', '');
  assert.equal(byProject.length, 1);
  assert.equal(byProject[0].photographerName, 'كرار المصور');
});

test('renamePhotographerInState updates photographer name and linked shoots', () => {
  const next = renamePhotographerInState(TEST_FIXTURE_STATE, 'p-1', 'سيف المصور');
  assert.equal(next.photographers[0].name, 'سيف المصور');
  assert.equal(next.shoots[0].photographerName, 'سيف المصور');
});

test('renameProjectInState updates project name across projects, shoots, ideas, and audioTasks', () => {
  const next = renameProjectInState(TEST_FIXTURE_STATE, 2, 'ريحانة بارك الترفيهي');
  assert.equal(next.projects[2], 'ريحانة بارك الترفيهي');
  assert.equal(next.shoots[2].project, 'ريحانة بارك الترفيهي');
  assert.equal(next.ideas[1].project, 'ريحانة بارك الترفيهي');
});

test('applyAdminDraftToState preserves multi-word names with spaces and updates state only when applied', () => {
  const draft = createAdminDraftFromState(TEST_FIXTURE_STATE);
  draft.photographers[0].name = 'مصطفى عبد الله المصور';
  draft.projects[0].currentName = 'مجمع بوابة ريحانة السكني الجديد';

  const updated = applyAdminDraftToState(TEST_FIXTURE_STATE, draft);
  assert.equal(updated.photographers[0].name, 'مصطفى عبد الله المصور');
  assert.equal(updated.shoots[0].photographerName, 'مصطفى عبد الله المصور');
  assert.equal(updated.projects[0], 'مجمع بوابة ريحانة السكني الجديد');
  assert.equal(updated.shoots[0].project, 'مجمع بوابة ريحانة السكني الجديد');
});

test('buildReminderSchedule supports preset intervals and manual custom times', () => {
  const halfHour = buildReminderSchedule({
    preset: '30',
    targetShootId: 's-1',
    nowMs: 1000,
  });
  assert.equal(halfHour.ok, true);
  if (halfHour.ok) {
    assert.equal(halfHour.schedule.intervalMinutes, 30);
    assert.equal(halfHour.schedule.label, 'بعد نصف ساعة');
    assert.equal(halfHour.schedule.targetShootId, 's-1');
  }

  const twoHours = buildReminderSchedule({
    preset: '120',
    nowMs: 1000,
  });
  assert.equal(twoHours.ok, true);
  if (twoHours.ok) {
    assert.equal(twoHours.schedule.intervalMinutes, 120);
    assert.equal(twoHours.schedule.label, 'بعد ساعتين');
  }

  const customValid = buildReminderSchedule({
    preset: 'custom',
    customAmount: '45',
    customUnit: 'minutes',
    targetShootId: 's-2',
    nowMs: 1000,
  });
  assert.equal(customValid.ok, true);
  if (customValid.ok) {
    assert.equal(customValid.schedule.intervalMinutes, 45);
    assert.equal(customValid.schedule.label, 'بعد 45 دقيقة');
    assert.equal(customValid.schedule.targetShootId, 's-2');
  }

  const customInvalid = buildReminderSchedule({
    preset: 'custom',
    customAmount: '0',
    customUnit: 'minutes',
  });
  assert.equal(customInvalid.ok, false);
});

test('findTargetNotificationShoot resolves exact preferred shoot or urgent pending shoot', () => {
  const preferred = findTargetNotificationShoot(TEST_FIXTURE_STATE.shoots, 's-2');
  assert.equal(preferred?.id, 's-2');

  const defaultPending = findTargetNotificationShoot(TEST_FIXTURE_STATE.shoots, null);
  assert.equal(defaultPending?.id, 's-1');
});

test('isScheduledReminderDue only returns true when scheduled time is reached', () => {
  const scheduleRes = buildReminderSchedule({
    preset: '60',
    targetShootId: 's-1',
    nowMs: 10000,
  });
  assert.equal(scheduleRes.ok, true);
  if (scheduleRes.ok) {
    assert.equal(isScheduledReminderDue(scheduleRes.schedule, 1, 35000), false);
    assert.equal(
      isScheduledReminderDue(scheduleRes.schedule, 1, 10000 + 60 * 60 * 1000),
      true
    );
  }
});

test('applyAdminDraftToState updates counterConfig fields and director personal achievements', () => {
  const normalized = normalizeAppState(TEST_FIXTURE_STATE);
  const draft = createAdminDraftFromState(normalized);
  draft.counterTabTitle = 'عداد الميدان ومنجزاتي';
  draft.directorCardTitle = 'وحدة منجزاتي الخاصة بالمونتاج';
  draft.photographerCustomFields.push({
    id: 'cfield-new',
    name: 'لقاءات حصرية للمجمع',
  });
  draft.directorCustomItems.push({
    id: 'dir-new',
    label: 'إعلانات ممولة 4K',
    count: 7,
  });

  const updated = applyAdminDraftToState(normalized, draft);
  assert.equal(updated.counterConfig?.tabTitle, 'عداد الميدان ومنجزاتي');
  assert.equal(updated.counterConfig?.directorCardTitle, 'وحدة منجزاتي الخاصة بالمونتاج');
  assert.equal(
    updated.counterConfig?.photographerCustomFields.some(
      (f) => f.name === 'لقاءات حصرية للمجمع'
    ),
    true
  );
  assert.equal(
    updated.counterConfig?.directorCustomItems.some(
      (i) => i.label === 'إعلانات ممولة 4K' && i.count === 7
    ),
    true
  );
});

test('createStartEditingNotification creates photographer notification and filterShoots hides completed shoots from active queue', () => {
  const shoot = TEST_FIXTURE_STATE.shoots[0];
  const notif = createStartEditingNotification(shoot, 'المونتير ماهر', '01:00 م');
  assert.equal(notif.photographerId, shoot.photographerId);
  assert.equal(notif.photographerName, shoot.photographerName);
  assert.equal(notif.directorName, 'المونتير ماهر');
  assert.equal(
    notif.message.includes('المونتير ماهر بدأ في العمل على هذا المشروع'),
    true
  );

  const activeQueue = filterShoots(TEST_FIXTURE_STATE.shoots, 'all', 'all', '');
  assert.equal(
    activeQueue.some((s) => s.status === 'completed'),
    false
  );
  assert.equal(activeQueue.length, 2);
});

test('generateSmartIdeaSuggestions generates unapproved suggestions and avoids duplicates', () => {
  const existingTitles = TEST_FIXTURE_STATE.ideas.map((i) => i.title);
  const suggestions = generateSmartIdeaSuggestions(
    TEST_FIXTURE_STATE.projects,
    existingTitles,
    3,
    'ريحانة بارك'
  );
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0].project, 'ريحانة بارك');
  assert.equal(suggestions[0].approvedForPhotographers, false);
  assert.equal(suggestions[0].isSuggestedByApp, true);
  assert.equal(existingTitles.includes(suggestions[0].title), false);
});

test('normalizeAppState purges legacy demo photographers (Ahmed, Ali Drone, Hussein) while keeping user photographers', () => {
  const dirtyState: Partial<AppState> = {
    ...INITIAL_APP_STATE,
    photographers: [
      { id: 'photog-1', name: 'أحمد المصور', pin: '0000' },
      { id: 'photog-2', name: 'علي الدرون', pin: '0000' },
      { id: 'photog-3', name: 'حسين الميداني', pin: '0000' },
      { id: 'user-photog-1', name: 'سجاد المصور', pin: '5555' },
    ],
    activeReminder: 'لديك تصوير عاجل من (أحمد المصور)',
  };

  const cleaned = normalizeAppState(dirtyState);
  assert.equal(cleaned.photographers.length, 1);
  assert.equal(cleaned.photographers[0].name, 'سجاد المصور');
  assert.equal(cleaned.activeReminder, null);
});

test('updatePhotographerSelfCredentials updates photographer PIN and Face ID setting', () => {
  const res = updatePhotographerSelfCredentials(TEST_FIXTURE_STATE, 'p-1', {
    newPin: '7788',
    faceIdEnabled: true,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.updatedPhotographer.pin, '7788');
    assert.equal(res.updatedPhotographer.faceIdEnabled, true);
    const verifyNew = verifyAccountPin(res.nextState, 'p-1', '7788');
    assert.equal(verifyNew.valid, true);
  }
});

test('authenticateUserByCredentials authenticates Maher Al-Khafaji (199400) and photographers by username and password', () => {
  const adminRes = authenticateUserByCredentials(TEST_FIXTURE_STATE, 'ماهر الخفاجي', '199400');
  assert.equal(adminRes.valid, true);
  assert.equal(adminRes.role, 'director');

  const wrongAdmin = authenticateUserByCredentials(TEST_FIXTURE_STATE, 'ماهر الخفاجي', '0000');
  assert.equal(wrongAdmin.valid, false);

  const photogRes = authenticateUserByCredentials(TEST_FIXTURE_STATE, 'بلال المصور', '1111');
  assert.equal(photogRes.valid, true);
  assert.equal(photogRes.role, 'photographer');
  assert.equal(photogRes.photographer?.id, 'p-1');
});
