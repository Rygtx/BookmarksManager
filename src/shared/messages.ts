import type {
  BookmarkImportPayload,
  BookmarkReadOptions,
  BookmarkTree,
  BookmarkSide,
  DiffOptions,
  DiffResult,
  DiffSummary,
  ExportOptions,
  QueuedDiffOperation,
  RuntimeErrorPayload,
  UserPreferences
} from "./types";

export enum MessageCommand {
  Ping = "PING",
  ImportFile = "IMPORT_FILE",
  ReadBrowserBookmarks = "READ_BROWSER_BOOKMARKS",
  ComputeDiff = "COMPUTE_DIFF",
  ApplyOperations = "APPLY_OPERATIONS",
  ExportBookmarks = "EXPORT_BOOKMARKS",
  SavePreferences = "SAVE_PREFERENCES",
  RestorePreferences = "RESTORE_PREFERENCES",
  ResetState = "RESET_STATE",
  DiffProgress = "DIFF_PROGRESS",
  Notify = "NOTIFY"
}

export type MessageSource = "ui" | "background";

export interface BaseMessage<C extends MessageCommand, P> {
  command: C;
  requestId: string;
  source: MessageSource;
  payload: P;
}

export interface BaseResponse<C extends MessageCommand, P> {
  command: C;
  requestId: string;
  success: boolean;
  payload?: P;
  error?: RuntimeErrorPayload;
}

export interface PingRequest extends BaseMessage<MessageCommand.Ping, { timestamp?: number }> {}

export interface PingResponse
  extends BaseResponse<MessageCommand.Ping, { alive: boolean; timestamp: number }> {}

export interface ImportFileRequest
  extends BaseMessage<MessageCommand.ImportFile, BookmarkImportPayload> {}

export interface ImportFileResponse
  extends BaseResponse<
    MessageCommand.ImportFile,
    { tree: BookmarkTree; importedAt: number }
  > {}

export interface ReadBrowserBookmarksRequest
  extends BaseMessage<
    MessageCommand.ReadBrowserBookmarks,
    { side: BookmarkSide; options?: BookmarkReadOptions }
  > {}

export interface ReadBrowserBookmarksResponse
  extends BaseResponse<
    MessageCommand.ReadBrowserBookmarks,
    { tree: BookmarkTree; fetchedAt: number }
  > {}

export interface ComputeDiffRequest
  extends BaseMessage<
    MessageCommand.ComputeDiff,
    { left: BookmarkTree; right: BookmarkTree; options?: DiffOptions }
  > {}

export interface ComputeDiffResponse
  extends BaseResponse<
    MessageCommand.ComputeDiff,
    { diffs: DiffResult[]; summary: DiffSummary; generatedAt: number }
  > {}

export interface ApplyOperationsRequest
  extends BaseMessage<
    MessageCommand.ApplyOperations,
    { operations: QueuedDiffOperation[]; options?: DiffOptions }
  > {}

export interface ApplyOperationsResponse
  extends BaseResponse<
    MessageCommand.ApplyOperations,
    { left?: BookmarkTree; right?: BookmarkTree; diffs?: DiffResult[]; summary?: DiffSummary }
  > {}

export interface ExportBookmarksRequest
  extends BaseMessage<
    MessageCommand.ExportBookmarks,
    { tree: BookmarkTree; options: ExportOptions }
  > {}

export interface ExportBookmarksResponse
  extends BaseResponse<
    MessageCommand.ExportBookmarks,
    { downloadId: string; fileName: string; size: number }
  > {}

export interface SavePreferencesRequest
  extends BaseMessage<
    MessageCommand.SavePreferences,
    { preferences: Partial<UserPreferences> }
  > {}

export interface SavePreferencesResponse
  extends BaseResponse<
    MessageCommand.SavePreferences,
    { preferences: UserPreferences; savedAt: number }
  > {}

export interface RestorePreferencesRequest
  extends BaseMessage<MessageCommand.RestorePreferences, Record<string, never>> {}

export interface RestorePreferencesResponse
  extends BaseResponse<
    MessageCommand.RestorePreferences,
    { preferences: UserPreferences | null }
  > {}

export interface ResetStateRequest
  extends BaseMessage<
    MessageCommand.ResetState,
    { scope?: BookmarkSide | "all" }
  > {}

export interface ResetStateResponse
  extends BaseResponse<MessageCommand.ResetState, { ok: true; scope: BookmarkSide | "all" }> {}

export interface DiffProgressEvent
  extends BaseMessage<
    MessageCommand.DiffProgress,
    { step: "parsing" | "matching" | "completed"; progress?: number }
  > {}

export interface NotifyEvent
  extends BaseMessage<
    MessageCommand.Notify,
    { level: "info" | "warning" | "error"; message: string }
  > {}

export type RuntimeRequest =
  | PingRequest
  | ImportFileRequest
  | ReadBrowserBookmarksRequest
  | ComputeDiffRequest
  | ApplyOperationsRequest
  | ExportBookmarksRequest
  | SavePreferencesRequest
  | RestorePreferencesRequest
  | ResetStateRequest;

export type RuntimeResponse =
  | PingResponse
  | ImportFileResponse
  | ReadBrowserBookmarksResponse
  | ComputeDiffResponse
  | ApplyOperationsResponse
  | ExportBookmarksResponse
  | SavePreferencesResponse
  | RestorePreferencesResponse
  | ResetStateResponse;

export type RuntimeEvent = DiffProgressEvent | NotifyEvent;

export type RuntimeMessage = RuntimeRequest | RuntimeEvent;

export type RuntimeMessageHandler = (message: RuntimeRequest) => Promise<RuntimeResponse>;
