import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "~/utils/db";
import { isDebugMode } from "~/config/environment";

const APP_NAME = isDebugMode() ? "Savr DEV" : "Savr";

export function useDocumentTitle() {
  const unreadCount = useLiveQuery(() => {
    return db.articles.where("state").equals("unread").count();
  });

  useEffect(() => {
    if (unreadCount !== undefined && unreadCount > 0) {
      document.title = `${APP_NAME} (${unreadCount})`;
    } else {
      document.title = APP_NAME;
    }
  }, [unreadCount]);
}
