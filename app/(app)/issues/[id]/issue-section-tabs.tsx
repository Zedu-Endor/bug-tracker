"use client";

import { useEffect, useState, type ReactNode, type KeyboardEvent } from "react";

type TabId = "description" | "conversation" | "decisions" | "activity";
type Props = {
  conversationCount: number;
  decisionsCount: number;
  conversation: ReactNode;
  decisions: ReactNode;
  description?: ReactNode;
  activity?: ReactNode;
  activityCount?: number;
};

/** Server-rendered content remains mounted; hash links open their owning tab. */
export function IssueSectionTabs({conversationCount, decisionsCount, conversation, decisions, description, activity, activityCount = 0}: Props) {
  const [tab, setTab] = useState<TabId>(description ? "description" : "conversation");
  const tabs: {id: TabId; label: string; count?: number; content: ReactNode}[] = [
    ...(description ? [{id: "description" as const, label: "Description", content: description}] : []),
    {id: "conversation", label: description ? "Discussion" : "Conversation", count: conversationCount, content: conversation},
    {id: "decisions", label: "Agent decisions", count: decisionsCount, content: decisions},
    ...(activity ? [{id: "activity" as const, label: "Activity", count: activityCount, content: activity}] : []),
  ];

  useEffect(() => {
    const revealTarget = () => {
      const hash = window.location.hash;
      const comment = new URLSearchParams(window.location.search).get("comment");
      let target: TabId | null = null;
      if (hash === "#conversation" || hash === "#comments" || hash.startsWith("#comment-")) target = "conversation";
      else if (hash === "#decisions") target = "decisions";
      else if (hash === "#activity") target = "activity";
      else if (hash === "#issue-evidence") target = "description";
      else if (comment) target = "conversation";
      if (!target) return;
      setTab(target);
      requestAnimationFrame(() => {
        const destination = document.getElementById(hash.slice(1));
        destination?.scrollIntoView({block: "start"});
      });
    };
    const frame = requestAnimationFrame(revealTarget);
    window.addEventListener("hashchange", revealTarget);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", revealTarget); };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`issue-tab-${tabs[next].id}`)?.focus();
  };

  return <div className="issue-content-tabs">
    <div role="tablist" aria-label="Issue sections" className="issue-tablist">
      {tabs.map((item, index) => <button key={item.id} type="button" role="tab"
        aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1}
        id={`issue-tab-${item.id}`} aria-controls={`issue-panel-${item.id}`}
        onClick={() => setTab(item.id)} onKeyDown={event => onKeyDown(event, index)}
        className="issue-content-tab">
        {item.label}{item.count !== undefined ? <span className="issue-tab-count">{item.count}</span> : null}
      </button>)}
    </div>
    {tabs.map(item => <div key={item.id} role="tabpanel" id={`issue-panel-${item.id}`}
      aria-labelledby={`issue-tab-${item.id}`} hidden={tab !== item.id} tabIndex={0}
      className="issue-tab-panel">{item.content}</div>)}
  </div>;
}
