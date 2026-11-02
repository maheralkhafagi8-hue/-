import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AppState } from './types';
import { normalizeAppState } from './utils/clacketLogic';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const WORKSPACE_COLLECTION = 'workspaces';
export const WORKSPACE_DOC_ID = 'clacket_frame_main';
export const WORKSPACE_PATH = `${WORKSPACE_COLLECTION}/${WORKSPACE_DOC_ID}`;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively strips undefined values so Firestore setDoc never rejects optional fields.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) {
    return null as unknown as T;
  }
  if ( value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) {
      result[k] = stripUndefinedDeep(v);
    }
  }
  return result as T;
}

/**
 * Prepares an AppState payload that strictly conforms to firebase-blueprint.json & firestore.rules.
 */
export function buildFirestoreWorkspacePayload(state: AppState): AppState {
  const normalized = normalizeAppState(state);
  const cleanPayload: AppState = stripUndefinedDeep({
    config: normalized.config,
    projects: (normalized.projects || []).slice(0, 200),
    photographers: (normalized.photographers || []).slice(0, 200),
    shoots: (normalized.shoots || []).slice(0, 1000),
    ideas: (normalized.ideas || []).slice(0, 500),
    audioTasks: (normalized.audioTasks || []).slice(0, 500),
    photographerNotifications: (normalized.photographerNotifications || []).slice(0, 500),
    activeReminder: normalized.activeReminder ?? null,
    activeReminderShootId: normalized.activeReminderShootId ?? null,
    reminderSchedule: normalized.reminderSchedule,
    counterConfig: normalized.counterConfig,
    lastUpdated:
      typeof normalized.lastUpdated === 'number' && normalized.lastUpdated > 0
        ? normalized.lastUpdated
        : Date.now(),
  });
  return cleanPayload;
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

export async function fetchWorkspaceStateFromFirestore(): Promise<AppState | null> {
  try {
    const snap = await getDocFromServer(doc(db, WORKSPACE_COLLECTION, WORKSPACE_DOC_ID));
    if (!snap.exists()) {
      return null;
    }
    const raw = snap.data() as Partial<AppState>;
    return normalizeAppState(raw);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('missing or insufficient permissions')
    ) {
      handleFirestoreError(error, OperationType.GET, WORKSPACE_PATH);
    }
    throw error;
  }
}

export async function saveWorkspaceStateToFirestore(state: AppState): Promise<void> {
  const payload = buildFirestoreWorkspacePayload(state);
  try {
    await setDoc(doc(db, WORKSPACE_COLLECTION, WORKSPACE_DOC_ID), payload);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('missing or insufficient permissions')
    ) {
      handleFirestoreError(error, OperationType.WRITE, WORKSPACE_PATH);
    }
    throw error;
  }
}

export function subscribeToWorkspaceState(
  onRemoteState: (state: AppState) => void,
  onEmptyDocument: () => void,
  onConnectionStatus: (connected: boolean) => void
): Unsubscribe {
  const ref = doc(db, WORKSPACE_COLLECTION, WORKSPACE_DOC_ID);
  return onSnapshot(
    ref,
    (snapshot) => {
      onConnectionStatus(true);
      if (!snapshot.exists()) {
        onEmptyDocument();
        return;
      }
      const data = snapshot.data() as Partial<AppState>;
      onRemoteState(normalizeAppState(data));
    },
    (error) => {
      onConnectionStatus(false);
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('missing or insufficient permissions')
      ) {
        handleFirestoreError(error, OperationType.GET, WORKSPACE_PATH);
      }
    }
  );
}
