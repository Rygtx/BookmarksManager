import {
  MessageCommand,
  type ImportFileResponse,
  type ReadBrowserBookmarksResponse,
  type RuntimeRequest,
  type RuntimeResponse,
  type SavePreferencesResponse,
} from "../../shared/messages";
import type {
  BookmarkImportPayload,
  BookmarkSide,
  BookmarkTree,
  UserPreferences,
} from "../../shared/types";

type ResponseMap = {
  [MessageCommand.ImportFile]: ImportFileResponse;
  [MessageCommand.ReadBrowserBookmarks]: ReadBrowserBookmarksResponse;
  [MessageCommand.RestorePreferences]: RuntimeResponse;
  [MessageCommand.SavePreferences]: SavePreferencesResponse;
  [MessageCommand.ResetState]: RuntimeResponse;
};

let requestIndex = 0;

const hasRuntime = () =>
  typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;

const createRequest = <C extends MessageCommand>(
  command: C,
  payload: RuntimeRequest["payload"]
): RuntimeRequest => ({
  command,
  requestId: `req-${Date.now()}-${++requestIndex}`,
  source: "ui",
  payload,
});

export async function sendRuntimeRequest<C extends MessageCommand>(
  command: C,
  payload: RuntimeRequest["payload"]
): Promise<ResponseMap[C]> {
  if (!hasRuntime()) {
    throw new Error("当前环境不支持 chrome.runtime 消息调用");
  }

  const request = createRequest(command, payload);

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const runtimeResponse = response as ResponseMap[C];
      if (!runtimeResponse?.success) {
        const message =
          runtimeResponse?.error?.message ?? "扩展返回未知错误";
        reject(new Error(message));
        return;
      }
      resolve(runtimeResponse);
    });
  });
}

export async function requestImportFile(payload: BookmarkImportPayload) {
  return sendRuntimeRequest(MessageCommand.ImportFile, payload);
}

export async function requestReadBrowserBookmarks(
  side: BookmarkSide
): Promise<ReadBrowserBookmarksResponse> {
  return sendRuntimeRequest(MessageCommand.ReadBrowserBookmarks, {
    side,
  });
}

export async function requestSavePreferences(
  preferences: Partial<UserPreferences>
) {
  return sendRuntimeRequest(MessageCommand.SavePreferences, { preferences });
}

export function runtimeAvailable() {
  return hasRuntime();
}
