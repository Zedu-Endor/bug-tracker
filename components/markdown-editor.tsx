"use client";

import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { RichText } from "@/components/rich-text";
import {
  BoldIcon,
  BulletedListIcon,
  CodeBlockIcon,
  CodeIcon,
  EyeIcon,
  ItalicIcon,
  LinkIcon,
  MentionIcon,
  NumberedListIcon,
  QuoteIcon,
  StrikethroughIcon,
  TaskListIcon,
} from "@/components/editor-icons";
import {
  useMentionSuggestions,
  type MentionUser,
} from "@/components/use-mention-suggestions";
import { matchShortcut } from "@/lib/editor-shortcuts";
import { pasteToMarkdown } from "@/lib/markdown-paste";
import {
  applyFormat,
  isSelectionInList,
  type FormatAction,
} from "@/lib/markdown-toolbar";
import { applyTextChange } from "@/lib/editor-dom";

export type MarkdownEditorHandle = {
  focus: () => void;
  getTextarea: () => HTMLTextAreaElement | null;
};

type EditorTab = "write" | "preview";

type ToolbarButtonSpec = {
  action?: FormatAction;
  label: string;
  shortcut?: string;
  icon: ReactNode;
  /** Only rendered in the Write tab (tab switches happen through the tabs). */
  tab?: EditorTab;
};

const WRITE_TOOLS: ToolbarButtonSpec[] = [
  // Bold: B glyph.
  { action: "bold", label: "Bold", icon: <BoldIcon /> },
  // Italic: slanted I glyph.
  { action: "italic", label: "Italic", icon: <ItalicIcon /> },
  // Strikethrough: S crossed by a horizontal line.
  { action: "strikethrough", label: "Strikethrough", icon: <StrikethroughIcon /> },
  // Heading levels use their explicit H1, H2, and H3 labels.
  {
    action: "heading1",
    label: "Heading 1",
    icon: <span className="text-xs font-bold leading-none">H1</span>,
  },
  {
    action: "heading2",
    label: "Heading 2",
    icon: <span className="text-xs font-bold leading-none">H2</span>,
  },
  {
    action: "heading3",
    label: "Heading 3",
    icon: <span className="text-xs font-bold leading-none">H3</span>,
  },
  // Quote: paired quotation marks.
  { action: "quote", label: "Quote", icon: <QuoteIcon /> },
  // Inline code: angle brackets.
  { action: "code", label: "Inline code", icon: <CodeIcon /> },
  // Code block: bordered block with angle brackets.
  { action: "codeBlock", label: "Code block", icon: <CodeBlockIcon /> },
  // Link: two connected loops.
  { action: "link", label: "Link", icon: <LinkIcon /> },
  // Bulleted list: dots with horizontal lines.
  { action: "ul", label: "Bulleted list", icon: <BulletedListIcon /> },
  // Numbered list: numerals with horizontal lines.
  { action: "ol", label: "Numbered list", icon: <NumberedListIcon /> },
  // Task list: checkboxes with horizontal lines.
  { action: "task", label: "Task list", icon: <TaskListIcon /> },
];

export type MarkdownEditorProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  rows?: number;
  /** Hint rendered under the editor. */
  footer?: ReactNode;
  /** Users offered by the @mention autocomplete. Omit to disable mentions. */
  users?: MentionUser[];
  /** Renders mention tags in the Preview tab. */
  renderMentions?: (text: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
} & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "children"
>;

function ToolbarButton({
  label,
  shortcut,
  disabled,
  icon,
  onClick,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      disabled={disabled}
      // Keep the textarea selection alive when the button is pressed. The
      // action itself runs on onClick so keyboard activation (Enter/Space
      // fire click, not mousedown) works too.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="rounded p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 sm:p-1.5"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
    </button>
  );
}

/**
 * GitHub-style Markdown editor: Write / Preview tabs, an icon toolbar, keyboard
 * shortcuts, @mentions and paste conversion. Content is stored as Markdown and
 * rendered through `RichText`, which never injects raw HTML.
 */
export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    id,
    name,
    value,
    onChange,
    placeholder,
    disabled = false,
    required,
    minLength,
    maxLength,
    rows = 6,
    footer,
    users,
    renderMentions,
    className = "",
    "aria-label": ariaLabel,
    onKeyDown,
    onKeyUp,
    onClick,
    onSelect,
    onPaste,
    onBlur,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const listboxId = `${fieldId}-mention-listbox`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<EditorTab>("write");
  // `false` on the server so the first client render matches the server HTML.
  const isApple = useSyncExternalStore(
    subscribeToNothing,
    () => /mac|iphone|ipad|ipod/i.test(navigator.userAgent),
    () => false,
  );

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    getTextarea: () => textareaRef.current,
  }));

  const mention = useMentionSuggestions({
    users: users ?? [],
    value,
    onChange,
    textareaRef,
    enabled: Boolean(users?.length),
  });

  const closeMentions = mention.close;

  const applyAction = useCallback(
    (action: FormatAction) => {
      const textarea = textareaRef.current;
      if (!textarea || disabled) return;
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      const next = applyFormat(value, start, end, action);
      closeMentions();
      setTab("write");
      applyTextChange(
        textarea,
        value,
        next.value,
        next.selectionStart,
        next.selectionEnd,
        onChange,
      );
    },
    [closeMentions, disabled, onChange, value],
  );

  const insertAtCaret = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      const available = maxLength ? maxLength - (value.length - (end - start)) : text.length;
      const inserted = text.slice(0, Math.max(0, available));
      const next = value.slice(0, start) + inserted + value.slice(end);
      const caret = start + inserted.length;
      applyTextChange(textarea, value, next, caret, caret, onChange);
    },
    [maxLength, onChange, value],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled) {
      onKeyDown?.(event);
      return;
    }

    if (mention.handleKeyDown(event)) {
      onKeyDown?.(event);
      return;
    }

    const textarea = event.currentTarget;

    // GitHub opens the mention picker with Ctrl/Cmd + Space.
    if ((event.metaKey || event.ctrlKey) && event.key === " ") {
      if (!users?.length) {
        onKeyDown?.(event);
        return;
      }
      event.preventDefault();
      const caret = textarea.selectionStart ?? 0;
      const next = `${value.slice(0, caret)}@${value.slice(caret)}`;
      applyTextChange(textarea, value, next, caret + 1, caret + 1, onChange);
      mention.sync(next, caret + 1);
      onKeyDown?.(event);
      return;
    }

    const match = matchShortcut(event, {
      inList: isSelectionInList(value, textarea.selectionStart, textarea.selectionEnd),
    });

    if (match) {
      // Unmatched keys (including Tab outside a list) keep the default behaviour.
      event.preventDefault();
      applyAction(match.action);
    }

    onKeyDown?.(event);
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    onPaste?.(event);
    if (disabled) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const markdown = pasteToMarkdown({
      text: clipboard.getData("text/plain"),
      html: clipboard.getData("text/html"),
    });
    if (!markdown) return;

    event.preventDefault();
    insertAtCaret(markdown.replace(/\n$/, ""));
  };

  const hasContent = value.trim().length > 0;
  const writing = tab === "write";

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg border border-slate-300 bg-white shadow-sm focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20">
        <div className="flex flex-wrap items-center gap-1 rounded-t-lg border-b border-slate-200 bg-slate-50 px-1.5 py-1">
          <div
            className="flex items-center gap-1 border-r border-slate-200 pr-1.5"
            role="tablist"
            aria-label="Editor mode"
          >
            <TabButton
              active={writing}
              disabled={disabled}
              onClick={() => setTab("write")}
            >
              Write
            </TabButton>
            <TabButton
              active={!writing}
              disabled={disabled || !hasContent}
              title={hasContent ? undefined : "Nothing to preview yet"}
              onClick={() => setTab("preview")}
              icon={<EyeIcon className="h-3.5 w-3.5" />}
            >
              Preview
            </TabButton>
          </div>

          <div
            className="flex flex-wrap items-center gap-0.5"
            role="toolbar"
            aria-label="Formatting"
          >
            {WRITE_TOOLS.map((tool) => (
              <ToolbarButton
                key={tool.label}
                label={tool.label}
                shortcut={shortcutLabelFor(tool.action, isApple)}
                disabled={disabled}
                icon={tool.icon}
                onClick={() => applyAction(tool.action as FormatAction)}
              />
            ))}
            {/* Mention: @ inside a speech bubble. */}
            {users?.length ? (
              <ToolbarButton
                label="Mention"
                shortcut={`${isApple ? "⌘" : "Ctrl+"}Space`}
                disabled={disabled}
                icon={<MentionIcon />}
                onClick={() => insertAtCaret("@")}
              />
            ) : null}
          </div>
        </div>

        <div className={writing ? "relative" : "hidden"}>
          <Textarea
            {...rest}
            ref={textareaRef}
            id={fieldId}
            name={name}
            value={value}
            required={required}
            minLength={minLength}
            maxLength={maxLength}
            rows={rows}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={`rounded-b-lg rounded-t-none border-0 shadow-none focus:border-transparent focus:ring-0 ${className}`}
            onChange={(event) => {
              const next = event.target.value;
              onChange(next);
              mention.sync(next, event.target.selectionStart ?? next.length);
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={(event) => {
              mention.sync(
                event.currentTarget.value,
                event.currentTarget.selectionStart ?? 0,
              );
              onKeyUp?.(event);
            }}
            onClick={(event: MouseEvent<HTMLTextAreaElement>) => {
              mention.sync(
                event.currentTarget.value,
                event.currentTarget.selectionStart ?? 0,
              );
              onClick?.(event);
            }}
            onSelect={(event) => {
              mention.sync(
                event.currentTarget.value,
                event.currentTarget.selectionStart ?? 0,
              );
              onSelect?.(event);
            }}
            onBlur={(event) => {
              mention.close();
              onBlur?.(event);
            }}
            onPaste={handlePaste}
            role={users?.length ? "combobox" : undefined}
            aria-autocomplete={users?.length ? "list" : undefined}
            aria-controls={
              users?.length && mention.showSuggestions ? listboxId : undefined
            }
            aria-expanded={
              users?.length ? mention.showSuggestions : undefined
            }
            aria-activedescendant={
              users?.length && mention.showSuggestions
                ? `${listboxId}-option-${mention.activeIndex}`
                : undefined
            }
          />
          {mention.showSuggestions ? (
            <MentionList
              listboxId={listboxId}
              suggestions={mention.suggestions}
              activeIndex={mention.activeIndex}
              onHover={mention.setActiveIndex}
              onSelect={mention.apply}
            />
          ) : null}
        </div>
        {!writing ? (
          <div className="max-h-96 overflow-y-auto rounded-b-lg px-3 py-2">
            <RichText
              content={value}
              className="mt-0"
              renderMentions={renderMentions}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        {footer}
        {maxLength ? (
          <p
            className={`ml-auto shrink-0 text-xs tabular-nums ${
              value.length > maxLength ? "text-red-600" : "text-slate-500"
            }`}
          >
            {value.length}/{maxLength}
          </p>
        ) : null}
      </div>
    </div>
  );
});

function subscribeToNothing() {
  return () => {};
}

function TabButton({
  active,
  disabled,
  title,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition ${
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300"
          : "text-slate-600 hover:text-slate-900"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
      {icon}
    </button>
  );
}

function MentionList({
  listboxId,
  suggestions,
  activeIndex,
  onHover,
  onSelect,
}: {
  listboxId: string;
  suggestions: MentionUser[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (user: MentionUser) => void;
}) {
  return (
    <ul
      id={listboxId}
      role="listbox"
      className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
    >
      {suggestions.map((user, index) => {
        const active = index === activeIndex;
        return (
          <li key={user.id} role="option" aria-selected={active}>
            <button
              id={`${listboxId}-option-${index}`}
              type="button"
              tabIndex={-1}
              className={`flex w-full px-3 py-2 text-left text-sm ${
                active
                  ? "bg-teal-50 text-teal-900"
                  : "text-slate-800 hover:bg-slate-50"
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(user);
              }}
              onMouseEnter={() => onHover(index)}
            >
              {user.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const SHORTCUT_KEYS: Partial<Record<FormatAction, { key: string; shift?: boolean }>> = {
  bold: { key: "b" },
  italic: { key: "i" },
  strikethrough: { key: "x", shift: true },
  code: { key: "e" },
  codeBlock: { key: "e", shift: true },
  link: { key: "k" },
  ul: { key: "8", shift: true },
  ol: { key: "7", shift: true },
  task: { key: "9", shift: true },
  quote: { key: ".", shift: true },
  heading1: { key: "1", shift: true },
  heading2: { key: "2", shift: true },
  heading3: { key: "3", shift: true },
};

function shortcutFor(action: FormatAction | undefined) {
  if (!action) return undefined;
  return SHORTCUT_KEYS[action];
}

function shortcutLabelFor(action: FormatAction | undefined, isApple: boolean) {
  const combo = shortcutFor(action);
  if (!combo) return undefined;
  const mod = isApple ? "⌘" : "Ctrl";
  return `${mod}${combo.shift ? (isApple ? "⇧" : "+Shift+") : isApple ? "" : "+"}${combo.key.toUpperCase()}`;
}
