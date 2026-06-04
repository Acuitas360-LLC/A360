import equal from "fast-deep-equal";
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
let plotlyModule: Promise<any> | null = null;
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useCopyToClipboard } from "usehooks-ts";
import type { Vote } from "@/lib/db/schema";
import { withBrowserAuthHeaders } from "@/lib/iframe-auth";
import type { ChatMessage } from "@/lib/types";
import { extractBackendMessageIdFromParts } from "@/lib/utils";
import { Action, Actions } from "./elements/actions";
import {
  AttachmentIcon,
  CopyIcon,
  InvoiceIcon,
  PencilEditIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from "./icons";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";

const ERROR_RESPONSE_MARKER = "[[ERROR_RESPONSE]]";
const RETRIABLE_VOTE_DELAYS_MS = [250, 500, 1000, 1500] as const;
const PPT_STAGE_LABELS_BASE = [
  "Analyzing content",
  "Structuring the story",
  "Drafting key slides",
  "Designing layout",
  "Finalizing presentation",
] as const;

const PPT_PREVIEW_THEME = {
  background: "#FFFFFF",
  titleText: "#0D1B3E",
  bodyText: "#0D1B3E",
  mutedText: "#556B88",
  accent1: "#00B4D8",
  accent2: "#00E5FF",
  accent3: "#39D353",
  panelBg: "#F0F4F8",
  kpiBg: "#F7F9FC",
  kpiLabelText: "#1E6EA8",
  kpiBorder: "#CCD6E0",
  subtitleLabel: "#1E6EA8",
  bulletDot: "#00B4D8",
  divider: "#00B4D8",
  insightLabel: "#00B4D8",
  insightText: "#556B88",
  fontTitle: "Calibri, 'Segoe UI', Arial, sans-serif",
  fontBody: "Calibri, 'Segoe UI', Arial, sans-serif",
};

const PPT_LAYOUT = {
  width: 10,
  height: 5.625,
  marginL: 0.38,
  marginR: 0.3,
  marginT: 0.18,
  subtitleH: 0.24,
  titleH: 0.48,
  dividerY: 0.94,
  dividerH: 0.03,
  footerH: 0.22,
  footerY: 5.345,
  contentT: 1.05,
  contentH: 3.635,
  contentW: 9.32,
  kpiGap: 0.18,
  kpiW: 2.85,
  leftPanelW: 6.29,
  kpiX: 6.85,
  insightH: 0.52,
  insightY: 4.785,
  chartPad: 0.06,
} as const;

const pctW = (value: number) => `${(value / PPT_LAYOUT.width) * 100}%`;
const pctH = (value: number) => `${(value / PPT_LAYOUT.height) * 100}%`;

type AutoFitTextProps = {
  text: string;
  minSize: number;
  maxSize: number;
  style?: CSSProperties;
};

const AutoFitText = ({ text, minSize, maxSize, style }: AutoFitTextProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fontSize, setFontSize] = useState(maxSize);
  const [needsScroll, setNeedsScroll] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    let rafId = 0;
    const fit = () => {
      let size = maxSize;
      el.style.fontSize = `${size}px`;
      while (size > minSize && el.scrollHeight > el.clientHeight) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
      setFontSize(size);
      setNeedsScroll(el.scrollHeight > el.clientHeight);
    };

    const scheduleFit = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(fit);
    };

    scheduleFit();
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(el);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, [text, minSize, maxSize]);

  return (
    <div
      ref={ref}
      style={{
        ...style,
        fontSize: `${fontSize}px`,
        overflowY: needsScroll ? "auto" : "hidden",
      }}
    >
      {text}
    </div>
  );
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildPptStageLabels(slideCount?: number): string[] {
  if (!slideCount) {
    return [...PPT_STAGE_LABELS_BASE];
  }

  const draftLabel =
    slideCount === 1
      ? "Drafting 1 slide..."
      : `Drafting ${slideCount} slides...`;

  return [
    "Analyzing content",
    "Structuring the story",
    draftLabel,
    "Designing layout",
    "Finalizing presentation",
  ];
}

function startPptStatusTracker(
  setStatus: (value: string) => void,
  setStageLabels: (labels: string[]) => void
) {
  const timeouts: number[] = [];
  let currentLabels = buildPptStageLabels();
  let hasPreview = false;
  let hasPpt = false;

  setStageLabels(currentLabels);
  setStatus(currentLabels[0]);

  timeouts.push(
    window.setTimeout(() => {
      if (!hasPreview) {
        setStatus(currentLabels[1]);
      }
    }, 1100)
  );
  timeouts.push(
    window.setTimeout(() => {
      if (!hasPreview) {
        setStatus(currentLabels[2]);
      }
    }, 2400)
  );

  const scheduleDesignStage = () => {
    timeouts.push(
      window.setTimeout(() => {
        if (!hasPpt) {
          setStatus(currentLabels[3]);
        }
      }, 900)
    );
  };

  return {
    markPreviewReady: (slideCount: number) => {
      hasPreview = true;
      currentLabels = buildPptStageLabels(slideCount);
      setStageLabels(currentLabels);
      setStatus(currentLabels[2]);
      scheduleDesignStage();
    },
    markPptReady: () => {
      hasPpt = true;
      setStatus(currentLabels[4]);
    },
    stop: () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    },
  };
}

type VotePatchPayload = {
  chatId: string;
  messageId: string;
  phase: "rating_only" | "feedback_only" | "enrich_only";
  type: "up" | "down";
  feedbackText?: string;
  userQuery?: string;
  assistantResponse?: string;
};

type PptMode = "slide" | "deck";
type PptDisposition = "inline" | "attachment";

type PptPreviewSlide = {
  title?: string;
  bullets?: string[];
  kpis?: Array<{ label?: string; value?: string }>;
  insight?: string;
  chart?: string | null;
  chartFit?: "contain" | "cover" | "fill" | null;
};

type PptResponse = {
  blob: Blob;
  filename?: string;
};

type PptCancelPayload = {
  requestId: string;
};

type PlotlyFigure = {
  data?: unknown[];
  layout?: Record<string, unknown>;
  frames?: unknown[];
  config?: Record<string, unknown>;
};

function getPlotlyFigure(message: ChatMessage): PlotlyFigure | undefined {
  const part = message.parts?.find(
    (item) => item.type === "data-visualizationFigure"
  ) as { data?: unknown } | undefined;

  if (!part || !part.data || typeof part.data !== "object") {
    return undefined;
  }

  return part.data as PlotlyFigure;
}

async function buildPlotlyImageBase64(
  figure: PlotlyFigure | undefined
): Promise<string | undefined> {
  if (!figure?.data?.length) {
    return undefined;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  if (!plotlyModule) {
    plotlyModule = import("plotly.js-dist-min");
  }

  const Plotly = await plotlyModule;

  const layout = {
    ...(figure.layout || {}),
    paper_bgcolor: "#FFFFFF",
    plot_bgcolor: "#FFFFFF",
  };

  try {
    const dataUrl = await Plotly.toImage(
      {
        data: figure.data,
        layout,
        config: figure.config,
      },
      { format: "png", width: 1000, height: 600, scale: 2 }
    );

    return typeof dataUrl === "string" ? dataUrl : undefined;
  } catch {
    return undefined;
  }
}

async function buildDeckChartImagesBase64(
  messages: ChatMessage[]
): Promise<string[] | undefined> {
  if (!Array.isArray(messages) || messages.length === 0) {
    return undefined;
  }

  const overrides: Array<string | undefined> = [];
  let currentIndex = -1;

  for (const entry of messages) {
    if (entry.role === "user") {
      overrides.push(undefined);
      currentIndex = overrides.length - 1;
      continue;
    }

    if (entry.role !== "assistant" || currentIndex < 0) {
      continue;
    }

    if (!overrides[currentIndex]) {
      const image = await buildPlotlyImageBase64(getPlotlyFigure(entry));
      if (image) {
        overrides[currentIndex] = image;
      }
    }
  }

  return overrides.map((value) => value || "");
}

function extractFilename(contentDisposition: string | null): string | undefined {
  if (!contentDisposition) {
    return undefined;
  }

  const match = contentDisposition.match(
    /filename\*?=(?:UTF-8''|"?)([^";]+)/i
  );
  if (!match || !match[1]) {
    return undefined;
  }

  const raw = match[1].trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function requestPpt(
  mode: PptMode,
  disposition: PptDisposition,
  chatId: string,
  messageId?: string,
  chartImageBase64?: string,
  chartImagesBase64?: string[],
  requestId?: string,
  signal?: AbortSignal
): Promise<PptResponse> {
  const response = await fetch("/api/ppt", {
    method: "POST",
    headers: withBrowserAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      mode,
      disposition,
      chatId,
      messageId,
      chartImageBase64,
      chartImagesBase64,
      requestId,
    }),
    signal,
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail || "PPT generation failed");
  }

  const filename = extractFilename(response.headers.get("content-disposition"));
  return {
    blob: await response.blob(),
    filename,
  };
}

async function requestPptPreview(
  chatId: string,
  messageId?: string,
  chartImageBase64?: string,
  chartImagesBase64?: string[],
  requestId?: string,
  signal?: AbortSignal
): Promise<PptPreviewSlide[]> {
  const response = await fetch("/api/ppt/preview", {
    method: "POST",
    headers: withBrowserAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      chatId,
      messageId,
      chartImageBase64,
      chartImagesBase64,
      requestId,
    }),
    signal,
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail || "PPT preview failed");
  }

  const payload = (await response.json()) as { slides?: PptPreviewSlide[] };
  return payload.slides ?? [];
}

async function requestPptCancel(payload: PptCancelPayload): Promise<void> {
  await fetch("/api/ppt/cancel", {
    method: "POST",
    headers: withBrowserAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      requestId: payload.requestId,
    }),
  });
}

function createPptRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `ppt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function patchVoteWithRetry(payload: VotePatchPayload): Promise<Response> {
  let lastDetail = "Vote save failed.";

  for (const retryDelayMs of RETRIABLE_VOTE_DELAYS_MS) {
    const response = await fetch("/api/vote", {
      method: "PATCH",
      headers: withBrowserAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return response;
    }

    const body = (await response.json().catch(() => null)) as
      | { retriable?: boolean; detail?: string }
      | null;
    lastDetail = body?.detail?.trim() || `Vote save failed (${response.status})`;

    const retriable = response.status === 409 && Boolean(body?.retriable);
    if (!retriable) {
      throw new Error(lastDetail);
    }

    await delay(retryDelayMs);
  }

  throw new Error(lastDetail);
}

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
  setMode,
  previousUserQuery,
  onNegativeFeedbackRetry,
  allMessages,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMode?: (mode: "view" | "edit") => void;
  previousUserQuery: string;
  onNegativeFeedbackRetry?: (
    originalUserQuery: string,
    feedbackText: string,
    downvotedMessageId: string
  ) => void;
  allMessages: ChatMessage[];
}) {
  const { mutate } = useSWRConfig();
  const [_, copyToClipboard] = useCopyToClipboard();
  const hasSubmittedFeedback = Boolean(vote);
  const [showDownvoteFeedback, setShowDownvoteFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmittingDownvoteFeedback, setIsSubmittingDownvoteFeedback] =
    useState(false);
  const [activePptMenu, setActivePptMenu] = useState<PptMode | null>(null);
  const [isGeneratingSlide, setIsGeneratingSlide] = useState(false);
  const [isGeneratingDeck, setIsGeneratingDeck] = useState(false);
  const [slidePpt, setSlidePpt] = useState<PptResponse | null>(null);
  const [deckPpt, setDeckPpt] = useState<PptResponse | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<PptMode | null>(null);
  const [slidePreview, setSlidePreview] = useState<PptPreviewSlide[] | null>(
    null
  );
  const [deckPreview, setDeckPreview] = useState<PptPreviewSlide[] | null>(
    null
  );
  const [slideStatusText, setSlideStatusText] = useState<string | null>(null);
  const [deckStatusText, setDeckStatusText] = useState<string | null>(null);
  const [slideStageLabels, setSlideStageLabels] = useState<string[]>([
    ...PPT_STAGE_LABELS_BASE,
  ]);
  const [deckStageLabels, setDeckStageLabels] = useState<string[]>([
    ...PPT_STAGE_LABELS_BASE,
  ]);
  const [showPptStages, setShowPptStages] = useState(false);
  const [pptDotStep, setPptDotStep] = useState(0);
  const pptControllersRef = useRef<
    Record<
      PptMode,
      {
        preview?: AbortController;
        ppt?: AbortController;
        previewRequestId?: string;
        pptRequestId?: string;
      }
    >
  >({
    slide: {},
    deck: {},
  });

  const backendMessageId =
    message.backendMessageId ?? extractBackendMessageIdFromParts(message.parts);
  const pptMessageId = backendMessageId || message.id;

  const textFromParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const persistVoteState = (isUpvoted: boolean) => {
    if (!backendMessageId) {
      return;
    }

    mutate<Vote[]>(
      `/api/vote?chatId=${chatId}`,
      (currentVotes) => {
        if (!currentVotes) {
          return [];
        }

        const votesWithoutCurrent = currentVotes.filter(
          (currentVote) => currentVote.messageId !== backendMessageId
        );

        return [
          ...votesWithoutCurrent,
          {
            chatId,
            messageId: backendMessageId,
            isUpvoted,
          },
        ];
      },
      { revalidate: false }
    );
  };

  const isInlineErrorMessage =
    message.role === "assistant" &&
    message.parts?.some(
      (part) =>
        part.type === "text" && part.text.includes(ERROR_RESPONSE_MARKER)
    );

  const isPptGenerating =
    activePptMenu === "slide" ? isGeneratingSlide : isGeneratingDeck;

  useEffect(() => {
    if (!isPptGenerating) {
      return;
    }

    const timer = window.setInterval(() => {
      setPptDotStep((step) => (step + 1) % 3);
    }, 360);

    return () => {
      window.clearInterval(timer);
    };
  }, [isPptGenerating]);

  if (isLoading) {
    return null;
  }

  if (isInlineErrorMessage) {
    return null;
  }

  const handleCopy = async () => {
    if (!textFromParts) {
      toast.error("There's no text to copy!");
      return;
    }

    await copyToClipboard(textFromParts);
    toast.success("Copied to clipboard!");
  };

  // User messages get edit (on hover) and copy actions
  if (message.role === "user") {
    return (
      <Actions className="mt-1 -mr-0.5 justify-end">
        <div className="relative">
          {setMode && (
            <Action
              className="absolute top-0 -left-10 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/message:opacity-100"
              data-testid="message-edit-button"
              onClick={() => setMode("edit")}
              tooltip="Edit"
            >
              <PencilEditIcon />
            </Action>
          )}
          <Action onClick={handleCopy} tooltip="Copy">
            <CopyIcon />
          </Action>
        </div>
      </Actions>
    );
  }

  const handlePptGenerate = async (mode: PptMode) => {
    const setLoading = mode === "slide" ? setIsGeneratingSlide : setIsGeneratingDeck;
    const setPreview = mode === "slide" ? setSlidePreview : setDeckPreview;
    const setResult = mode === "slide" ? setSlidePpt : setDeckPpt;
    const setStatus = mode === "slide" ? setSlideStatusText : setDeckStatusText;
    const setStageLabels =
      mode === "slide" ? setSlideStageLabels : setDeckStageLabels;
    setLoading(true);
    setActivePptMenu(mode);
    setPreviewMode(mode);
    const tracker = startPptStatusTracker(setStatus, setStageLabels);
    const previewController = new AbortController();
    const pptController = new AbortController();
    const previewRequestId = createPptRequestId();
    const pptRequestId = createPptRequestId();
    pptControllersRef.current[mode] = {
      preview: previewController,
      ppt: pptController,
      previewRequestId,
      pptRequestId,
    };

    try {
      const messageId = mode === "slide" ? pptMessageId : undefined;
      const chartImageBase64 =
        mode === "slide" ? await buildPlotlyImageBase64(getPlotlyFigure(message)) : undefined;
      const chartImagesBase64 =
        mode === "deck" ? await buildDeckChartImagesBase64(allMessages) : undefined;
      const previewPromise = requestPptPreview(
        chatId,
        messageId,
        chartImageBase64,
        chartImagesBase64,
        previewRequestId,
        previewController.signal
      ).then(
        (slides) => {
          tracker.markPreviewReady(slides.length);
          return slides;
        }
      );
      const pptPromise = requestPpt(
        mode,
        "attachment",
        chatId,
        messageId,
        chartImageBase64,
        chartImagesBase64,
        pptRequestId,
        pptController.signal
      ).then(
        (pptx) => {
          tracker.markPptReady();
          return pptx;
        }
      );
      const [slides, pptx] = await Promise.all([previewPromise, pptPromise]);
      if (!slides.length) {
        throw new Error("Preview is empty.");
      }
      setPreview(slides);
      setResult(pptx);
      tracker.stop();
      setStatus("Ready.");
      toast.success("Slide Deck Generated.");
    } catch (error) {
      if (isAbortError(error)) {
        tracker.stop();
        setStatus("Cancelled.");
        return;
      }
      const messageText =
        error instanceof Error ? error.message : "PPT generation failed";
      toast.error(messageText);
      tracker.stop();
      setStatus("Generation failed. Please try again.");
    } finally {
      setLoading(false);
      pptControllersRef.current[mode] = {};
    }
  };

  const handlePptCancel = async (mode: PptMode) => {
    const controllers = pptControllersRef.current[mode];
    controllers.preview?.abort();
    controllers.ppt?.abort();

    const requestIds = [
      controllers.previewRequestId,
      controllers.pptRequestId,
    ].filter(Boolean) as string[];

    await Promise.all(requestIds.map((requestId) => requestPptCancel({ requestId })));
    pptControllersRef.current[mode] = {};

    if (mode === "slide") {
      setIsGeneratingSlide(false);
      setSlideStatusText("Cancelled.");
    } else {
      setIsGeneratingDeck(false);
      setDeckStatusText("Cancelled.");
    }

    setActivePptMenu(null);
    setPreviewMode(null);
    setShowPptStages(false);
    toast.info("PPT generation cancelled.");
  };

  const handlePptOpen = async (mode: PptMode, disposition: PptDisposition) => {
    const setResult = mode === "slide" ? setSlidePpt : setDeckPpt;
    const existing = mode === "slide" ? slidePpt : deckPpt;

    const openBlob = (result: PptResponse) => {
      const objectUrl = URL.createObjectURL(result.blob);
      if (disposition === "inline") {
        window.open(objectUrl, "_blank", "noopener,noreferrer");
      } else {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = result.filename || `${mode}.pptx`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    };

    if (existing) {
      openBlob(existing);
      return;
    }

    const setLoading = mode === "slide" ? setIsGeneratingSlide : setIsGeneratingDeck;
    setLoading(true);
    const chartImageBase64 =
      mode === "slide" ? await buildPlotlyImageBase64(getPlotlyFigure(message)) : undefined;
    const chartImagesBase64 =
      mode === "deck" ? await buildDeckChartImagesBase64(allMessages) : undefined;
    requestPpt(
      mode,
      "attachment",
      chatId,
      mode === "slide" ? pptMessageId : undefined,
      chartImageBase64,
      chartImagesBase64
    )
      .then((result) => {
        setResult(result);
        openBlob(result);
      })
      .catch((error) => {
        const messageText =
          error instanceof Error ? error.message : "PPT generation failed";
        toast.error(messageText);
      })
      .finally(() => setLoading(false));
  };

  const handlePreviewOpen = () => {
    const mode = previewMode ?? activePptMenu;
    if (!mode) {
      toast.error("Preview not ready yet.");
      return;
    }
    const slides = mode === "slide" ? slidePreview : deckPreview;
    if (!slides || slides.length === 0) {
      toast.error("Preview not ready yet.");
      return;
    }
    setPreviewMode(mode);
    setIsPreviewOpen(true);
  };

  const previewDownloadMode = previewMode ?? activePptMenu;
  const previewDownloadReady =
    previewDownloadMode === "slide" ? Boolean(slidePpt) : Boolean(deckPpt);
  const activeStatusText =
    activePptMenu === "slide"
      ? slideStatusText || "Generating..."
      : deckStatusText || "Generating...";
  const activeStageLabels =
    activePptMenu === "slide" ? slideStageLabels : deckStageLabels;
  const activeStageIndex = Math.max(
    0,
    activeStageLabels.findIndex((text) => text === activeStatusText)
  );
  const activeDots = ".".repeat(pptDotStep + 1);

  return (
    <Actions className="mt-1.5 pl-0.5 md:pl-0">
      <Action onClick={handleCopy} tooltip="Copy">
        <CopyIcon />
      </Action>

      <Action
        data-testid="message-upvote"
        disabled={hasSubmittedFeedback || !backendMessageId}
        onClick={() => {
          if (!backendMessageId) {
            toast.error("Vote is not ready yet. Please try again shortly.");
            return;
          }

          // Optimistic update so UI reflects the vote instantly.
          persistVoteState(true);

          const upvote = patchVoteWithRetry({
            chatId,
            messageId: backendMessageId,
            phase: "rating_only",
            type: "up",
          });

          toast.promise(upvote, {
            loading: "Upvoting Response...",
            success: () => "Upvoted Response!",
            error: "Failed to upvote response.",
          });
        }}
        tooltip="Upvote Response"
      >
        <ThumbUpIcon />
      </Action>

      <Action
        data-testid="message-downvote"
        disabled={hasSubmittedFeedback || !backendMessageId}
        onClick={() => {
          if (!backendMessageId) {
            toast.error("Vote is not ready yet. Please try again shortly.");
            return;
          }

          // Optimistic update so UI reflects the vote instantly.
          persistVoteState(false);

          const downvote = patchVoteWithRetry({
            chatId,
            messageId: backendMessageId,
            phase: "rating_only",
            type: "down",
          });

          toast.promise(downvote, {
            loading: "Downvoting Response...",
            success: () => {
              setShowDownvoteFeedback(true);

              return "Downvoted Response!";
            },
            error: "Failed to downvote response.",
          });
        }}
        tooltip="Downvote Response"
      >
        <ThumbDownIcon />
      </Action>

      <Action
        data-testid="message-create-slide"
        disabled={isGeneratingSlide}
        onClick={() => handlePptGenerate("slide")}
        tooltip="Create Slide"
      >
        <AttachmentIcon />
      </Action>

      <Action
        data-testid="message-create-deck"
        disabled={isGeneratingDeck}
        onClick={() => handlePptGenerate("deck")}
        tooltip="Create Deck"
      >
        <InvoiceIcon size={16} />
      </Action>

      {showDownvoteFeedback && (
        <div className="response-evidence mt-2 w-full p-3">
          <p className="mb-2 font-medium text-sm">What went wrong?</p>
          <Textarea
            className="min-h-[88px] bg-background/80"
            onChange={(event) => setFeedbackText(event.target.value)}
            placeholder="Share what was wrong so we can regenerate a better response..."
            value={feedbackText}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              disabled={isSubmittingDownvoteFeedback}
              onClick={async () => {
                const trimmed = feedbackText.trim();
                if (!trimmed) {
                  toast.error("Please describe what went wrong.");
                  return;
                }

                setIsSubmittingDownvoteFeedback(true);
                try {
                  if (!backendMessageId) {
                    toast.error("Vote is not ready yet. Please try again shortly.");
                    return;
                  }

                  // Trigger feedback query immediately; persist feedback text in parallel.
                  onNegativeFeedbackRetry?.(
                    previousUserQuery,
                    trimmed,
                    backendMessageId
                  );
                  setShowDownvoteFeedback(false);
                  setFeedbackText("");

                  const saveFeedbackPromise = patchVoteWithRetry({
                    chatId,
                    messageId: backendMessageId,
                    phase: "feedback_only",
                    type: "down",
                    feedbackText: trimmed,
                  });

                  await saveFeedbackPromise;
                  toast.success("Feedback saved. Retrying with your input.");
                } catch {
                  toast.error("Failed to save feedback details.");
                } finally {
                  setIsSubmittingDownvoteFeedback(false);
                }
              }}
              size="sm"
              type="button"
            >
              Submit and retry
            </Button>
            <Button
              disabled={isSubmittingDownvoteFeedback}
              onClick={() => {
                setShowDownvoteFeedback(false);
                setFeedbackText("");
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {activePptMenu && (
        <div className="response-evidence mt-2 w-full p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-medium text-sm">
              {activePptMenu === "slide" ? "Create slide" : "Create deck"}
            </p>
            <button
              className="-mr-1 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              onClick={() => {
                if (
                  activePptMenu === "slide" ? isGeneratingSlide : isGeneratingDeck
                ) {
                  handlePptCancel(activePptMenu);
                  return;
                }

                setActivePptMenu(null);
                setPreviewMode(null);
                setShowPptStages(false);
              }}
              type="button"
              aria-label="Close"
            >
              &#x2715;
            </button>
          </div>
          {(activePptMenu === "slide" ? isGeneratingSlide : isGeneratingDeck) ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-2 rounded-full bg-primary/70 animate-[pulse_2s_ease-in-out_infinite]" />
                  <span className="font-semibold text-foreground/90">
                    {activeStatusText}
                    <span className="ml-1 text-muted-foreground/70">
                      {activeDots}
                    </span>
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowPptStages((current) => !current)}
                    type="button"
                  >
                    {showPptStages ? "Hide steps" : "Show steps"}
                  </button>
                  <Button
                    onClick={() => handlePptCancel(activePptMenu)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
              {showPptStages && (
                <ol className="space-y-2 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                  {activeStageLabels.map((label, index) => {
                    const isCompleted = index < activeStageIndex;
                    const isActive = index === activeStageIndex;

                    return (
                      <li
                        className="relative flex items-start gap-2 transition-all duration-300 animate-in fade-in slide-in-from-top-1"
                        key={`ppt-stage-${label}`}
                      >
                        {index < activeStageLabels.length - 1 && (
                          <span className="absolute left-[0.28rem] top-3 h-[calc(100%+0.5rem)] w-px bg-border/60" />
                        )}
                        <span
                          className={
                            "relative mt-1 size-2.5 shrink-0 rounded-full transition-colors duration-200 " +
                            (isActive
                              ? "bg-primary/80"
                              : isCompleted
                                ? "bg-muted-foreground/55"
                                : "bg-muted-foreground/35")
                          }
                        />
                        <span
                          className={
                            "text-sm transition-colors duration-200 " +
                            (isActive
                              ? "font-semibold text-foreground"
                              : isCompleted
                                ? "font-medium text-muted-foreground"
                                : "text-muted-foreground/70")
                          }
                        >
                          {label}
                          {isActive && (
                            <span className="ml-1 text-muted-foreground/70">
                              {activeDots}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handlePreviewOpen}
                size="sm"
                type="button"
              >
                Preview
              </Button>
              <Button
                onClick={() => handlePptOpen(activePptMenu, "attachment")}
                size="sm"
                type="button"
                variant="outline"
              >
                Download
              </Button>
            </div>
          )}
        </div>
      )}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {previewMode === "deck" ? "Deck preview" : "Slide preview"}
            </DialogTitle>
          </DialogHeader>
          <div className="ppt-preview-scroll h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-6 pb-12">
              {(previewMode === "slide" ? slidePreview : deckPreview)?.map(
                (slide, index) => (
                  <div
                    className="rounded-2xl border-2 border-primary/70 bg-white p-4 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.35)]"
                    key={`ppt-preview-${index}`}
                  >
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Slide {index + 1}
                    </div>
                    {(() => {
                      const hasKpis =
                        Array.isArray(slide.kpis) && slide.kpis.length > 0;
                      const hasInsight = Boolean(slide.insight);
                      const hasChart = Boolean(slide.chart);
                      const insightLabelH = 0.22;
                      const logoW = 0.8;
                      const logoH = 0.4;
                      const logoMargin = 0.2;
                      const logoX = PPT_LAYOUT.marginL;
                      const logoY = PPT_LAYOUT.insightY + insightLabelH + logoMargin;
                      const contentBot = hasInsight
                        ? PPT_LAYOUT.insightY - 0.1
                        : PPT_LAYOUT.footerY - 0.06;
                      const contentH = contentBot - PPT_LAYOUT.contentT;
                      const leftPanelW = hasKpis
                        ? PPT_LAYOUT.leftPanelW
                        : PPT_LAYOUT.contentW;
                      const kpis = (slide.kpis ?? []).slice(0, 3);
                      const kpiGap = 0.14;
                      const kpiCardH = hasKpis
                        ? (contentH - kpiGap * (kpis.length - 1)) /
                          Math.max(kpis.length, 1)
                        : 0;
                      const kpiGapPct = hasKpis
                        ? (kpiGap / contentH) * 100
                        : 0;
                      const chartFit = slide.chartFit || "contain";
                      const chartPad = chartFit === "cover" || chartFit === "fill" ? 0 : PPT_LAYOUT.chartPad;
                      const chartPadX = (chartPad / leftPanelW) * 100;
                      const chartPadY = (chartPad / contentH) * 100;
                      const accentColors = [
                        PPT_PREVIEW_THEME.accent1,
                        PPT_PREVIEW_THEME.accent2,
                        PPT_PREVIEW_THEME.accent3,
                      ];

                      return (
                        <div
                          className="relative w-full overflow-hidden rounded-lg border"
                          style={{
                            aspectRatio: "16 / 9",
                            background: PPT_PREVIEW_THEME.background,
                            fontFamily: PPT_PREVIEW_THEME.fontBody,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: pctW(PPT_LAYOUT.marginL),
                              top: pctH(PPT_LAYOUT.marginT),
                              height: pctH(PPT_LAYOUT.subtitleH),
                              fontSize: "clamp(10px, 1.4vw, 12px)",
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: PPT_PREVIEW_THEME.subtitleLabel,
                            }}
                          >
                            BUSINESS QUESTION
                          </div>
                          <div
                            style={{
                              position: "absolute",
                              left: pctW(PPT_LAYOUT.marginL),
                              top: pctH(
                                PPT_LAYOUT.marginT + PPT_LAYOUT.subtitleH
                              ),
                              width: pctW(PPT_LAYOUT.contentW),
                              height: pctH(PPT_LAYOUT.titleH),
                              fontSize: "clamp(18px, 2.6vw, 28px)",
                              fontWeight: 700,
                              color: PPT_PREVIEW_THEME.titleText,
                              fontFamily: PPT_PREVIEW_THEME.fontTitle,
                            }}
                          >
                            {slide.title || "Untitled"}
                          </div>
                          <div
                            style={{
                              position: "absolute",
                              left: pctW(PPT_LAYOUT.marginL),
                              top: pctH(PPT_LAYOUT.dividerY),
                              width: pctW(PPT_LAYOUT.contentW),
                              height: pctH(PPT_LAYOUT.dividerH),
                              background: PPT_PREVIEW_THEME.divider,
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              left: pctW(PPT_LAYOUT.marginL),
                              top: pctH(PPT_LAYOUT.contentT),
                              width: pctW(leftPanelW),
                              height: pctH(contentH),
                              background: PPT_PREVIEW_THEME.panelBg,
                              border: `1px solid ${PPT_PREVIEW_THEME.kpiBorder}`,
                              borderRadius: "6px",
                              overflow: "hidden",
                            }}
                          >
                            {hasChart ? (
                              <img
                                alt="Slide chart"
                                src={slide.chart ?? undefined}
                                style={{
                                  position: "absolute",
                                  left: `${chartPadX}%`,
                                  top: `${chartPadY}%`,
                                  width: `calc(100% - ${chartPadX * 2}%)`,
                                  height: `calc(100% - ${chartPadY * 2}%)`,
                                  objectFit: chartFit,
                                  objectPosition: "center",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  position: "absolute",
                                  left: "6%",
                                  top: "8%",
                                  right: "6%",
                                  bottom: "8%",
                                  color: PPT_PREVIEW_THEME.bodyText,
                                  fontSize: "clamp(11px, 1.6vw, 14px)",
                                  lineHeight: 1.3,
                                }}
                              >
                                {(slide.bullets ?? []).map(
                                  (bullet, bulletIndex) => (
                                    <div
                                      key={`ppt-bullet-${index}-${bulletIndex}`}
                                      style={{
                                        display: "flex",
                                        gap: "8px",
                                        marginBottom: "8px",
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: PPT_PREVIEW_THEME.bulletDot,
                                          fontWeight: 700,
                                        }}
                                      >
                                        ●
                                      </span>
                                      <span>{bullet}</span>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                          {hasKpis && (
                            <div
                              style={{
                                position: "absolute",
                                left: pctW(PPT_LAYOUT.kpiX),
                                top: pctH(PPT_LAYOUT.contentT),
                                width: pctW(PPT_LAYOUT.kpiW),
                                height: pctH(contentH),
                              }}
                            >
                              {kpis.map((kpi, kpiIndex) => (
                                (() => {
                                  const valueText = kpi.value || "--";
                                  const kpiRecord = kpi as Record<string, unknown>;
                                  const definitionText =
                                    (typeof kpiRecord.defination === "string"
                                      ? kpiRecord.defination
                                      : "") ||
                                    (typeof kpiRecord.definition === "string"
                                      ? kpiRecord.definition
                                      : "");

                                  return (
                                    <div
                                      key={`ppt-kpi-${index}-${kpiIndex}`}
                                      style={{
                                        position: "absolute",
                                        top: `${kpiIndex * (kpiGapPct + (kpiCardH / contentH) * 100)}%`,
                                        height: `${(kpiCardH / contentH) * 100}%`,
                                        left: 0,
                                        right: 0,
                                        border: `1px solid ${PPT_PREVIEW_THEME.kpiBorder}`,
                                        background: PPT_PREVIEW_THEME.kpiBg,
                                        borderRadius: "6px",
                                        padding: "5% 8% 0",
                                      }}
                                    >
                                  <div
                                    style={{
                                      position: "absolute",
                                      left: 0,
                                      top: 0,
                                      bottom: 0,
                                      width: "6%",
                                      background:
                                        accentColors[kpiIndex % accentColors.length],
                                    }}
                                  />
                                  <div
                                    style={{
                                      marginLeft: "10%",
                                      height: "100%",
                                      display: "grid",
                                      gridTemplateRows: "auto minmax(0, 1fr) auto",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "clamp(9px, 1.2vw, 12px)",
                                        fontWeight: 700,
                                        color: PPT_PREVIEW_THEME.kpiLabelText,
                                        lineHeight: 1.1,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {kpi.label || "KPI"}
                                    </div>
                                    <AutoFitText
                                      text={valueText}
                                      minSize={9}
                                      maxSize={28}
                                      style={{
                                        marginTop: "3%",
                                        flex: "1 1 auto",
                                        minHeight: 0,
                                        fontWeight: 700,
                                        color: PPT_PREVIEW_THEME.titleText,
                                        fontFamily: PPT_PREVIEW_THEME.fontTitle,
                                        lineHeight: 1.15,
                                        whiteSpace: "normal",
                                        wordBreak: "break-word",
                                        overflowWrap: "anywhere",
                                      }}
                                    />
                                    {definitionText ? (
                                      <div
                                        style={{
                                          fontSize: "clamp(7px, 0.9vw, 9px)",
                                          lineHeight: 1.25,
                                          fontStyle: "italic",
                                          color: PPT_PREVIEW_THEME.mutedText,
                                          whiteSpace: "normal",
                                          wordBreak: "break-word",
                                          overflowWrap: "anywhere",
                                        }}
                                      >
                                        {definitionText}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                );
                              })()
                              ))}
                            </div>
                          )}
                          {hasInsight && (
                            <>
                              <div
                                style={{
                                  position: "absolute",
                                  left: pctW(PPT_LAYOUT.marginL),
                                  top: pctH(PPT_LAYOUT.insightY),
                                  fontSize: "clamp(9px, 1.2vw, 11px)",
                                  fontWeight: 700,
                                  letterSpacing: "0.06em",
                                  color: PPT_PREVIEW_THEME.insightLabel,
                                }}
                              >
                                KEY INSIGHT
                              </div>
                              <img
                                alt="Geron logo"
                                src="/images/geron_logo.png"
                                style={{
                                  position: "absolute",
                                  left: pctW(logoX),
                                  top: pctH(logoY),
                                  width: pctW(logoW),
                                  height: pctH(logoH),
                                  objectFit: "contain",
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  left: pctW(PPT_LAYOUT.marginL + 1.11),
                                  top: pctH(PPT_LAYOUT.insightY),
                                  width: pctW(PPT_LAYOUT.contentW - 1.11),
                                  height: pctH(PPT_LAYOUT.insightH),
                                  fontSize: "clamp(10px, 1.3vw, 12px)",
                                  color: PPT_PREVIEW_THEME.insightText,
                                  lineHeight: 1.4,
                                }}
                              >
                                {slide.insight}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )
              )}
            </div>
          </div>
          <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t bg-background/95 pt-4">
            {previewDownloadMode && (
              <Button
                disabled={!previewDownloadReady}
                onClick={() => handlePptOpen(previewDownloadMode, "attachment")}
                size="sm"
                type="button"
              >
                Download
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Actions>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.previousUserQuery !== nextProps.previousUserQuery) {
      return false;
    }

    return true;
  }
);
