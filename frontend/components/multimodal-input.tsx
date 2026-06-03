"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { BulkUploadSelector } from "@/components/bulk-upload-selector";
import { DailyPulseSelector } from "@/components/daily-pulse-selector";
import { withBrowserAuthHeaders } from "@/lib/iframe-auth";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import { ArrowUpIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { SuggestionDropdown, type SuggestionItem } from "./suggestion-dropdown";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  prominent,
  selectedVisibilityType,
  selectedModelId: _selectedModelId,
  onModelChange,
  onBulkUploadStart,
  onSubmitTriggered,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  prominent?: boolean;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  onBulkUploadStart?: (questions: string[]) => void;
  onSubmitTriggered?: () => void;
}) {
  const DEFAULT_TEXTAREA_HEIGHT = 44;
  const MAX_TEXTAREA_HEIGHT = 200;
  const MIN_SUGGESTION_LENGTH = 2;
  const SUGGESTION_DEBOUNCE_MS = 35;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const defaultTextareaHeightRef = useRef(DEFAULT_TEXTAREA_HEIGHT);
  const { width } = useWindowSize();

  const resizeTextareaToContent = useCallback(
    (textarea: HTMLTextAreaElement) => {
      textarea.style.height = "auto";

      const minHeight = defaultTextareaHeightRef.current;
      const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);

      textarea.style.height = `${Math.max(nextHeight, minHeight)}px`;
      textarea.style.overflowY =
        textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
    },
    [MAX_TEXTAREA_HEIGHT]
  );

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = `${defaultTextareaHeightRef.current}px`;
      textareaRef.current.style.overflowY = "hidden";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      defaultTextareaHeightRef.current =
        textareaRef.current.getBoundingClientRect().height ||
        DEFAULT_TEXTAREA_HEIGHT;
      adjustHeight();
    }
  }, [adjustHeight]);

  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (!hasAutoFocused.current && width) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        hasAutoFocused.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [width]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = `${defaultTextareaHeightRef.current}px`;
      textareaRef.current.style.overflowY = "hidden";
    }
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [hasSuggestionsLoaded, setHasSuggestionsLoaded] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [suggestionsPlacement, setSuggestionsPlacement] = useState<
    "above" | "below"
  >("above");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<string>("");
  const lastRequestAtRef = useRef(0);
  const requestIdRef = useRef(0);
  const isFirstSuggestionRef = useRef(true);
  const suggestionsCacheRef = useRef<Map<string, SuggestionItem[]>>(new Map());

  const normalizeSuggestionQuery = useCallback((value: string) => {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);

      if (finalValue) {
        resizeTextareaToContent(textareaRef.current);
      } else {
        adjustHeight();
      }
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, resizeTextareaToContent, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const closeSuggestions = useCallback(() => {
    setSuggestionsOpen(false);
    setHighlightedIndex(-1);
    setHasSuggestionsLoaded(false);
  }, []);

  const handleSelectSuggestion = useCallback(
    (suggestion: SuggestionItem) => {
      setInput(suggestion.question);
      lastQueryRef.current = suggestion.question.trim();
      setSuggestionsOpen(false);
      setHighlightedIndex(-1);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    },
    [setInput]
  );

  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const normalized = normalizeSuggestionQuery(query);
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const controller = new AbortController();
      abortRef.current = controller;
      setSuggestionsOpen(true);
      setIsSuggestionsLoading(true);
      setHasSuggestionsLoaded(false);

      try {
        const response = await fetch(
          `/api/suggestions?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            headers: withBrowserAuthHeaders(),
          }
        );
        if (!response.ok) {
          throw new Error(`Suggestions request failed: ${response.status}`);
        }

        const data = (await response.json()) as SuggestionItem[];
        if (requestIdRef.current !== requestId) {
          return;
        }
        setHasSuggestionsLoaded(true);
        if (normalized) {
          suggestionsCacheRef.current.set(normalized, data);
          if (suggestionsCacheRef.current.size > 200) {
            const firstKey = suggestionsCacheRef.current.keys().next().value as
              | string
              | undefined;
            if (firstKey) {
              suggestionsCacheRef.current.delete(firstKey);
            }
          }
        }
        setSuggestions(data);
        setSuggestionsOpen(data.length > 0);
        setHighlightedIndex(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
          setSuggestionsOpen(false);
          setHasSuggestionsLoaded(true);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsSuggestionsLoading(false);
        }
      }
    },
    [normalizeSuggestionQuery]
  );

  useEffect(() => {
    const query = input.trim();
    const normalized = normalizeSuggestionQuery(query);

    if (normalized.length < MIN_SUGGESTION_LENGTH) {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      setSuggestions([]);
      setSuggestionsOpen(false);
      setIsSuggestionsLoading(false);
      setHasSuggestionsLoaded(false);
      lastQueryRef.current = "";
      isFirstSuggestionRef.current = true;
      return;
    }

    const cached = suggestionsCacheRef.current.get(normalized);
    if (cached) {
      setSuggestions(cached);
      setSuggestionsOpen(true);
      setHighlightedIndex(-1);
      setHasSuggestionsLoaded(true);
      setIsSuggestionsLoading(false);
      lastQueryRef.current = normalized;
      return;
    }

    if (normalized === lastQueryRef.current) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setSuggestions([]);
    setIsSuggestionsLoading(true);
    setSuggestionsOpen(true);
    setHasSuggestionsLoaded(false);
    setHighlightedIndex(-1);

    const now = Date.now();
    const elapsed = now - lastRequestAtRef.current;
    const runFetch = () => {
      lastRequestAtRef.current = Date.now();
      lastQueryRef.current = normalized;
      fetchSuggestions(query);
    };

    if (isFirstSuggestionRef.current || elapsed >= SUGGESTION_DEBOUNCE_MS) {
      isFirstSuggestionRef.current = false;
      runFetch();
      return;
    }

    debounceRef.current = setTimeout(
      runFetch,
      Math.max(0, SUGGESTION_DEBOUNCE_MS - elapsed)
    );

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [fetchSuggestions, input, normalizeSuggestionQuery]);

  useEffect(() => {
    if (!suggestionsOpen) {
      return;
    }

    const target = textareaRef.current;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const desiredHeight = 264;

    if (spaceAbove < desiredHeight && spaceBelow > spaceAbove) {
      setSuggestionsPlacement("below");
    } else {
      setSuggestionsPlacement("above");
    }
  }, [suggestionsOpen]);

  useEffect(() => {
    if (!suggestionsOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        closeSuggestions();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [closeSuggestions, suggestionsOpen]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [hasInteracted, setHasInteracted] = useState(messages.length > 0);

  useEffect(() => {
    if (messages.length > 0) {
      setHasInteracted(true);
    }
  }, [messages.length]);

  const submitForm = useCallback(() => {
    window.history.pushState({}, "", `/chat/${chatId}`);
    setHasInteracted(true);
    onSubmitTriggered?.();
    closeSuggestions();

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput("");
    resetHeight();
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    onSubmitTriggered,
    resetHeight,
    closeSuggestions,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!suggestionsOpen || (suggestions.length === 0 && !isSuggestionsLoading)) {
        if (event.key === "Enter" && !event.shiftKey) {
          const hasContent = input.trim().length > 0 || attachments.length > 0;
          if (!hasContent) {
            return;
          }
          event.preventDefault();
          if (status !== "ready") {
            toast.error("Please wait for the model to finish its response!");
          } else {
            submitForm();
          }
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) =>
          prev + 1 >= suggestions.length ? 0 : prev + 1
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) =>
          prev - 1 < 0 ? suggestions.length - 1 : prev - 1
        );
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (highlightedIndex >= 0) {
          const suggestion = suggestions[highlightedIndex];
          if (suggestion) {
            handleSelectSuggestion(suggestion);
          }
          return;
        }
        const hasContent = input.trim().length > 0 || attachments.length > 0;
        if (!hasContent) {
          return;
        }
        if (status !== "ready") {
          toast.error("Please wait for the model to finish its response!");
        } else {
          submitForm();
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeSuggestions();
      }
    },
    [
      attachments.length,
      closeSuggestions,
      handleSelectSuggestion,
      highlightedIndex,
      input,
      isSuggestionsLoading,
      status,
      submitForm,
      suggestions,
      suggestionsOpen,
    ]
  );

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = event.target;
    resizeTextareaToContent(target);

    setInput(event.target.value);
  };

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) {
        return;
      }

      // Prevent default paste behavior for images
      event.preventDefault();

      setUploadQueue((prev) => [...prev, "Pasted image"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) =>
            attachment !== undefined &&
            attachment.url !== undefined &&
            attachment.contentType !== undefined
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch (error) {
        console.error("Error uploading pasted images:", error);
        toast.error("Failed to upload pasted image(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  // Add paste event listener to textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div
      className={cn("relative flex w-full flex-col gap-4", className)}
      ref={suggestionsRef}
    >
      <input
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <PromptInput
        className={cn(
          "relative overflow-visible rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50",
          prominent &&
            "-translate-y-px border-border/70 bg-background/95 ring-1 ring-black/[0.06] shadow-sm supports-[backdrop-filter]:bg-background/85"
        )}
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() && attachments.length === 0) {
            return;
          }
          if (status !== "ready") {
            toast.error("Please wait for the model to finish its response!");
          } else {
            submitForm();
          }
        }}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex flex-row items-end gap-2 overflow-x-scroll"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        <div className="flex flex-row items-start gap-1 sm:gap-2">
          <PromptInputTextarea
            className="grow resize-none border-0! border-none! bg-transparent p-2 text-base text-left outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
            data-testid="multimodal-input"
            disableAutoResize={true}
            maxHeight={MAX_TEXTAREA_HEIGHT}
            minHeight={defaultTextareaHeightRef.current}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask your query"
            ref={textareaRef}
            rows={1}
            value={input}
          />
        </div>
        <SuggestionDropdown
          open={suggestionsOpen}
          loading={isSuggestionsLoading}
          hasLoaded={hasSuggestionsLoaded}
          suggestions={suggestions}
          highlightedIndex={highlightedIndex}
          onSelect={handleSelectSuggestion}
          onHighlight={setHighlightedIndex}
          placement={suggestionsPlacement}
        />
        <PromptInputToolbar className="border-top-0! border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
          <PromptInputTools className="gap-0 sm:gap-0.5">
            <BulkUploadSelector
              onConfigured={(config) => {
                onBulkUploadStart?.(config.questions);
              }}
            />
            <DailyPulseSelector
              onConfigured={(questions) => {
                onBulkUploadStart?.(questions);
              }}
            />
          </PromptInputTools>

          {status === "submitted" || status === "streaming" ? (
            <StopButton stop={stop} />
          ) : (
            <PromptInputSubmit
              className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              data-testid="send-button"
              disabled={!input.trim() || uploadQueue.length > 0}
              status={status}
            >
              <ArrowUpIcon size={14} />
            </PromptInputSubmit>
          )}
        </PromptInputToolbar>
      </PromptInput>

      {prominent &&
        !hasInteracted &&
        messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <div className="pt-2 md:pt-3">
            <SuggestedActions
              chatId={chatId}
              onSuggestionSelected={() => setHasInteracted(true)}
              selectedVisibilityType={selectedVisibilityType}
              sendMessage={sendMessage}
            />
          </div>
        )}
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }

    return true;
  }
);

function PureStopButton({
  stop,
}: {
  stop: () => void;
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
