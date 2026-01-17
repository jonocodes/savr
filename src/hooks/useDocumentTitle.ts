import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "~/utils/db";

/**
 * Hook that updates the document title to show the unread article count.
 * Format: "Savr (x)" where x is the number of unread articles.
 * Shows "Savr" without count when there are no unread articles.
 */
export function useDocumentTitle() {
  const unreadCount = useLiveQuery(() => {
    return db.articles.where("state").equals("unread").count();
  });

  useEffect(() => {
    if (unreadCount !== undefined && unreadCount > 0) {
      document.title = `Savr (${unreadCount})`;
    } else {
      document.title = "Savr";
    }
  }, [unreadCount]);
}
