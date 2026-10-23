"use client";

import { useState, useTransition } from "react";
import {
  setEmailNotificationsAction,
  setNotificationKindAction,
} from "@/app/actions/settings";
import { Switch } from "@/components/ui/switch";
import {
  NOTIFICATION_KINDS,
  PREF_FIELD,
  notificationDescriptions,
  notificationLabels,
  type NotificationKind,
  type PrefField,
} from "@/lib/notification-prefs";

export type NotificationPrefs = Record<PrefField, boolean>;

export function NotificationSettings({
  initialEnabled,
  initialPrefs,
}: {
  initialEnabled: boolean;
  initialPrefs: NotificationPrefs;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleMaster(next: boolean) {
    setEnabled(next);
    setMessage(null);
    startTransition(async () => {
      const result = await setEmailNotificationsAction(next);
      if (result.error) {
        setEnabled(!next);
        setMessage(result.error);
      } else {
        setMessage(next ? "Email notifications are on." : "Email notifications are off.");
      }
    });
  }

  function toggleKind(kind: NotificationKind, next: boolean) {
    const field = PREF_FIELD[kind];
    setPrefs((current) => ({ ...current, [field]: next }));
    setMessage(null);
    startTransition(async () => {
      const result = await setNotificationKindAction(kind, next);
      if (result.error) {
        setPrefs((current) => ({ ...current, [field]: !next }));
        setMessage(result.error);
      } else {
        setMessage(`${notificationLabels[kind]} ${next ? "turned on" : "turned off"}.`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 rounded-[14px] bg-tint p-3.5 sm:px-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id="email-notifications-label" className="text-sm font-bold text-ink">
            Email me about activity on my issues
          </span>
          <span id="email-notifications-hint" className="text-[13px] text-muted">
            Turn off to stop all issue emails.
          </span>
        </div>
        <Switch
          id="email-notifications"
          checked={enabled}
          disabled={pending}
          label="Email me about activity on my issues"
          describedBy="email-notifications-hint"
          onChange={toggleMaster}
        />
      </div>

      {/*
        The per-kind choices stay in the DOM while the master switch is off,
        disabled rather than removed, so turning it back on shows what is
        still selected instead of looking like a fresh opt-in to everything.
      */}
      <fieldset
        disabled={!enabled || pending}
        className="flex flex-col gap-2 disabled:opacity-55"
      >
        <legend className="sr-only">Which emails to send</legend>
        {NOTIFICATION_KINDS.map((kind) => {
          const id = `notify-${kind}`;
          const hintId = `${id}-hint`;
          return (
            <div
              key={kind}
              className="ml-5 flex items-center justify-between gap-4 rounded-[14px] bg-chip p-3.5 sm:px-4"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span id={`${id}-label`} className="text-sm font-bold text-ink">
                  {notificationLabels[kind]}
                </span>
                <span id={hintId} className="text-[13px] text-muted">
                  {notificationDescriptions[kind]}
                </span>
              </div>
              <Switch
                id={id}
                checked={prefs[PREF_FIELD[kind]]}
                disabled={!enabled || pending}
                label={notificationLabels[kind]}
                describedBy={hintId}
                onChange={(next) => toggleKind(kind, next)}
              />
            </div>
          );
        })}
      </fieldset>

      <p role="status" aria-live="polite" className="text-sm font-semibold text-ok-fg empty:hidden">
        {message}
      </p>
    </div>
  );
}
