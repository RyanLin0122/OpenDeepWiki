"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  GitBranch,
  FileCode,
  Brain,
  Sparkles,
  Terminal,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";
import { fetchRepoStatus, fetchProcessingLogs, regenerateRepository } from "@/lib/repository-api";
import { buildRepoDocPath } from "@/lib/repo-route";
import type { RepositoryStatus, ProcessingStep, ProcessingLogItem } from "@/types/repository";

// 虚拟化列表项类型
type VirtualLogItem = 
  | { type: "header"; step: ProcessingStep; count: number }
  | { type: "log"; log: ProcessingLogItem };

interface RepositoryProcessingStatusProps {
  owner: string;
  repo: string;
  status: RepositoryStatus;
  onRefresh?: () => void;
}

const statusConfig = {
  Pending: {
    icon: Clock,
    colorClass: "text-yellow-500",
    bgClass: "bg-yellow-500/10",
    borderClass: "border-yellow-500/20",
    glowClass: "shadow-yellow-500/20",
  },
  Processing: {
    icon: Loader2,
    colorClass: "text-blue-500",
    bgClass: "bg-blue-500/10",
    borderClass: "border-blue-500/20",
    glowClass: "shadow-blue-500/20",
  },
  Completed: {
    icon: CheckCircle2,
    colorClass: "text-green-500",
    bgClass: "bg-green-500/10",
    borderClass: "border-green-500/20",
    glowClass: "shadow-green-500/20",
  },
  CompletedNoDocs: {
    icon: AlertTriangle,
    colorClass: "text-amber-500",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/20",
    glowClass: "shadow-amber-500/20",
  },
  Empty: {
    icon: AlertTriangle,
    colorClass: "text-slate-500",
    bgClass: "bg-slate-500/10",
    borderClass: "border-slate-500/20",
    glowClass: "shadow-slate-500/20",
  },
  PartialFailed: {
    icon: AlertTriangle,
    colorClass: "text-orange-500",
    bgClass: "bg-orange-500/10",
    borderClass: "border-orange-500/20",
    glowClass: "shadow-orange-500/20",
  },
  Failed: {
    icon: XCircle,
    colorClass: "text-red-500",
    bgClass: "bg-red-500/10",
    borderClass: "border-red-500/20",
    glowClass: "shadow-red-500/20",
  },
};

// 处理步骤配置
const processingSteps: { id: ProcessingStep; icon: typeof GitBranch; labelKey: string }[] = [
  { id: "Workspace", icon: GitBranch, labelKey: "workspace" },
  { id: "Catalog", icon: FileCode, labelKey: "catalog" },
  { id: "Content", icon: Brain, labelKey: "content" },
  { id: "Complete", icon: CheckCircle2, labelKey: "complete" },
];

export function RepositoryProcessingStatus({
  owner,
  repo,
  status: initialStatus,
  onRefresh,
}: RepositoryProcessingStatusProps) {
  const t = useTranslations();
  const [status, setStatus] = useState<RepositoryStatus>(initialStatus);
  const [currentStep, setCurrentStep] = useState<ProcessingStep>("Workspace");
  const [logs, setLogs] = useState<ProcessingLogItem[]>([]);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [completedDocuments, setCompletedDocuments] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [dots, setDots] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRegenerating, setIsRegenerating] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logIdsRef = useRef<Set<string>>(new Set());
  const shouldScrollRef = useRef(false);

  // 将日志转换为虚拟化列表项（包含分组标题）- 优化计算
  const virtualItems = useMemo<VirtualLogItem[]>(() => {
    if (logs.length === 0) return [];
    
    const items: VirtualLogItem[] = [];
    let currentStepName: ProcessingStep | null = null;
    let headerIndex = -1;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      
      if (log.stepName !== currentStepName) {
        // 添加新的分组标题，先用 0 占位
        headerIndex = items.length;
        items.push({ type: "header", step: log.stepName, count: 0 });
        currentStepName = log.stepName;
      }
      
      // 更新当前分组的计数
      if (headerIndex >= 0) {
        (items[headerIndex] as { type: "header"; step: ProcessingStep; count: number }).count++;
      }
      
      items.push({ type: "log", log });
    }

    return items;
  }, [logs]);

  // 虚拟化配置
  const rowVirtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => logsContainerRef.current,
    estimateSize: () => 28, // 固定高度，避免重计算
    overscan: 5, // 减少 overscan
  });

  // 滚动到日志底部 - 使用 ref 避免依赖变化
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (logsContainerRef.current) {
        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
      }
    });
  }, []);

  // 处理滚动
  useEffect(() => {
    if (shouldScrollRef.current) {
      shouldScrollRef.current = false;
      scrollToBottom();
    }
  }, [logs.length, scrollToBottom]);

  // 轮询获取状态和日志
  const pollStatusAndLogs = useCallback(async () => {
    try {
      // 获取状态
      const statusResponse = await fetchRepoStatus(owner, repo);
      setStatus(statusResponse.statusName);
      setLastUpdated(new Date());

      // 获取处理日志
      const logsResponse = await fetchProcessingLogs(owner, repo, undefined, 500);
      
      // 更新进度信息
      setTotalDocuments(logsResponse.totalDocuments);
      setCompletedDocuments(logsResponse.completedDocuments);
      if (logsResponse.startedAt) {
        setStartedAt(new Date(logsResponse.startedAt));
      }
      
      if (logsResponse.logs.length > 0) {
        // 使用 ref 存储已有 ID，避免每次创建新 Set
        const newLogs = logsResponse.logs.filter(l => !logIdsRef.current.has(l.id));
        
        if (newLogs.length > 0) {
          // 更新 ID 集合
          newLogs.forEach(l => logIdsRef.current.add(l.id));
          
          setLogs(prev => {
            const allLogs = [...prev, ...newLogs].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            return allLogs;
          });
          
          shouldScrollRef.current = true;
        }
        
        setCurrentStep(logsResponse.currentStepName);
      }

      // 如果完成了，跳转到文档页面
      if (statusResponse.statusName === "Completed" && statusResponse.defaultSlug) {
        setIsPolling(false);
        setCurrentStep("Complete");
        setTimeout(() => {
          window.location.href = buildRepoDocPath(owner, repo, statusResponse.defaultSlug);
        }, 2000);
      }

      // 如果失败了，停止轮询
      if (
        statusResponse.statusName === "Failed" ||
        statusResponse.statusName === "PartialFailed" ||
        statusResponse.statusName === "CompletedNoDocs" ||
        statusResponse.statusName === "Empty"
      ) {
        setIsPolling(false);
      }
    } catch (error) {
      console.error("Failed to poll status:", error);
    }
  }, [owner, repo]);

  // 初始加载日志
  useEffect(() => {
    const loadInitialLogs = async () => {
      try {
        const logsResponse = await fetchProcessingLogs(owner, repo, undefined, 500);
        if (logsResponse.logs.length > 0) {
          // 初始化 ID 集合
          logsResponse.logs.forEach(l => logIdsRef.current.add(l.id));
          setLogs(logsResponse.logs);
          setCurrentStep(logsResponse.currentStepName);
          setTotalDocuments(logsResponse.totalDocuments);
          setCompletedDocuments(logsResponse.completedDocuments);
          if (logsResponse.startedAt) {
            setStartedAt(new Date(logsResponse.startedAt));
          }
          shouldScrollRef.current = true;
        }
      } catch (error) {
        console.error("Failed to load initial logs:", error);
      }
    };
    loadInitialLogs();
  }, [owner, repo]);

  // 轮询定时器 - 5秒间隔减少请求频率
  useEffect(() => {
    if (!isPolling) return;

    const pollInterval = setInterval(() => {
      pollStatusAndLogs();
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [isPolling, pollStatusAndLogs]);

  // 动态点点点效果
  useEffect(() => {
    if (status === "Processing" || status === "Pending") {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [status]);

  // 计时器 - 基于后端开始时间计算
  useEffect(() => {
    if ((status === "Processing" || status === "Pending") && startedAt) {
      const updateElapsed = () => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
        setElapsedTime(elapsed);
      };
      
      // 立即更新一次
      updateElapsed();
      
      // 每秒更新
      const timer = setInterval(updateElapsed, 1000);
      return () => clearInterval(timer);
    }
  }, [status, startedAt]);

  const config = statusConfig[status];
  const Icon = config.icon;
  const isProcessing = status === "Processing" || status === "Pending";

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatLastUpdated = (date: Date) => {
    return date.toLocaleTimeString();
  };

  const handleRetry = async () => {
    setIsRegenerating(true);
    try {
      const result = await regenerateRepository(owner, repo);
      if (result.success) {
        // 重置状态，重新开始轮询
        setStatus("Pending");
        setLogs([]);
        logIdsRef.current.clear();
        setCurrentStep("Workspace");
        setTotalDocuments(0);
        setCompletedDocuments(0);
        setStartedAt(null);
        setElapsedTime(0);
        setIsPolling(true);
      } else {
        console.error("Regenerate failed:", result.errorMessage);
        // 可以在这里显示错误提示
      }
    } catch (error) {
      console.error("Failed to regenerate:", error);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleManualRefresh = () => {
    pollStatusAndLogs();
  };

  // 获取步骤索引
  const getStepIndex = (step: ProcessingStep) => {
    return processingSteps.findIndex(s => s.id === step);
  };

  const currentStepIndex = getStepIndex(currentStep);

  return (
    <div className="flex min-h-[90vh] items-center justify-center p-4">
      <div
        className={`w-[90%] max-w-6xl rounded-xl border-2 ${config.borderClass} ${config.bgClass} p-8 shadow-lg ${config.glowClass}`}
      >
        {/* 头部图标和仓库信息 */}
        <div className="flex flex-col items-center mb-4">
          <div
            className={`rounded-full p-3 ${config.bgClass} border ${config.borderClass} mb-3`}
          >
            <Icon
              className={`h-10 w-10 ${config.colorClass} ${status === "Processing" ? "animate-spin" : ""}`}
            />
          </div>

          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <GitBranch className="h-4 w-4" />
            <span className="text-sm">GitHub</span>
          </div>

          <h2 className="text-lg font-bold text-center">
            {owner}/{repo}
          </h2>
        </div>

        {/* 状态标签 */}
        <div className="flex justify-center mb-3">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${config.bgClass} ${config.colorClass} border ${config.borderClass}`}
          >
            <Sparkles className="h-4 w-4" />
            {t(`home.repository.status.${status.toLowerCase()}`)}
            {isProcessing && dots}
          </span>
        </div>

        {/* 处理中的详细信息 */}
        {isProcessing && (
          <div className="space-y-4">
            {/* 处理步骤 */}
            <div className="bg-background/50 rounded-lg p-3 border border-border/50">
              <div className="text-xs text-muted-foreground mb-2">
                {t("home.repository.status.processingSteps") || "Processing Steps"}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {processingSteps.map((step, index) => {
                  const StepIcon = step.icon;
                  const isActive = index === currentStepIndex;
                  const isCompleted = index < currentStepIndex;
                  const isPending = index > currentStepIndex;

                  return (
                    <div
                      key={step.id}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-300 ${
                        isActive
                          ? "bg-blue-500/20 border border-blue-500/30"
                          : isCompleted
                            ? "bg-green-500/10 border border-green-500/20"
                            : "bg-muted/30 border border-transparent opacity-50"
                      }`}
                    >
                      <StepIcon
                        className={`h-4 w-4 ${
                          isActive
                            ? "text-blue-500 animate-pulse"
                            : isCompleted
                              ? "text-green-500"
                              : "text-muted-foreground"
                        }`}
                      />
                      <span
                        className={`text-[10px] text-center ${
                          isActive
                            ? "text-blue-500 font-medium"
                            : isCompleted
                              ? "text-green-500"
                              : "text-muted-foreground"
                        }`}
                      >
                        {t(`home.repository.status.steps.${step.labelKey}`) || step.labelKey}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 文档生成进度条 - 仅在 Content 步骤显示 */}
            {currentStep === "Content" && totalDocuments > 0 && (
              <div className="bg-background/50 rounded-lg p-3 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-muted-foreground font-medium">
                      {t("home.repository.status.documentProgress") || "Document Progress"}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-blue-500">
                    {completedDocuments} / {totalDocuments}
                  </span>
                </div>
                <div className="w-full bg-muted/50 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-400 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min((completedDocuments / totalDocuments) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                  <span>{Math.round((completedDocuments / totalDocuments) * 100)}%</span>
                  <span>
                    {t("home.repository.status.remaining") || "Remaining"}: {totalDocuments - completedDocuments}
                  </span>
                </div>
              </div>
            )}

            {/* 日志输出 - 虚拟化列表 */}
            {logs.length > 0 && (
              <div className="bg-background/80 rounded-lg border border-border/50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">
                      {t("home.repository.status.logs") || "Processing Logs"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {logs.length} {t("home.repository.status.entries") || "entries"}
                  </span>
                </div>
                <div 
                  ref={logsContainerRef}
                  className="h-[50vh] overflow-y-auto p-2 font-mono text-xs"
                >
                  <div
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const item = virtualItems[virtualRow.index];
                      
                      if (item.type === "header") {
                        return (
                          <div
                            key={virtualRow.key}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: `${virtualRow.size}px`,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                            className="flex items-center gap-2 py-1.5 px-2 rounded border-l-2 border-blue-500 bg-background/95"
                          >
                            <span className="text-blue-500 font-semibold text-xs uppercase">
                              {t(`home.repository.status.steps.${item.step.toLowerCase()}`) || item.step}
                            </span>
                            <span className="text-muted-foreground/50">—</span>
                            <span className="text-muted-foreground/70 text-[10px]">
                              {item.count} {t("home.repository.status.items") || "items"}
                            </span>
                          </div>
                        );
                      }

                      const log = item.log;
                      const time = new Date(log.createdAt).toLocaleTimeString('zh-CN', { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit' 
                      });

                      // 工具调用
                      if (log.toolName) {
                        return (
                          <div
                            key={virtualRow.key}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: `${virtualRow.size}px`,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                            className="flex items-center gap-2 py-1 px-2 ml-2 rounded bg-purple-500/10 border-l-2 border-purple-500"
                          >
                            <Wrench className="h-3 w-3 text-purple-400 flex-shrink-0" />
                            <span className="text-purple-400 font-medium truncate">{log.toolName}</span>
                            <span className="text-muted-foreground/50 text-[10px] ml-auto flex-shrink-0">{time}</span>
                          </div>
                        );
                      }

                      // AI 输出
                      if (log.isAiOutput) {
                        return (
                          <div
                            key={virtualRow.key}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: `${virtualRow.size}px`,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                            className="flex items-center gap-2 py-0.5 px-2 ml-2 text-muted-foreground/60"
                          >
                            <span className="text-blue-400/50 flex-shrink-0">•</span>
                            <span className="truncate">{log.message}</span>
                          </div>
                        );
                      }

                      // 普通状态消息
                      return (
                        <div
                          key={virtualRow.key}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className="flex items-center gap-2 py-1 px-2 ml-2 rounded hover:bg-muted/30 transition-colors"
                        >
                          <span className="text-green-500 flex-shrink-0">›</span>
                          <span className="text-foreground/80 truncate flex-1">{log.message}</span>
                          <span className="text-muted-foreground/50 text-[10px] flex-shrink-0">{time}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 计时器和状态信息 */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {t("home.repository.status.elapsed") || "Elapsed"}:{" "}
                  {formatTime(elapsedTime)}
                </span>
              </div>
              <button
                onClick={handleManualRefresh}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isPolling ? "animate-spin" : ""}`} />
                <span>{formatLastUpdated(lastUpdated)}</span>
              </button>
            </div>

            {/* 提示信息 */}
            <div className="bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground text-center">
              <p>
                {t("home.repository.status.processingTip") ||
                  "Large repositories may take several minutes to process."}
              </p>
            </div>
          </div>
        )}

        {/* 失败状态 */}
        {status === "Failed" && (
          <div className="space-y-4">
            {logs.length > 0 && (
              <div className="bg-background/80 rounded-lg border border-red-500/20 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/20">
                  <Terminal className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-red-400 font-medium">
                    {t("home.repository.status.errorLogs") || "Error Logs"}
                  </span>
                </div>
                <div className="max-h-[30vh] overflow-y-auto p-3 space-y-1.5 font-mono text-sm">
                  {logs.slice(-10).map((log) => (
                    <div key={log.id} className="text-red-400/80 p-1">
                      <span className="text-red-500">›</span> {log.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleRetry}
              disabled={isRegenerating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRegenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isRegenerating 
                ? (t("home.repository.status.regenerating") || "Regenerating...")
                : t("home.repository.status.retry")}
            </button>
          </div>
        )}

        {/* 完成状态 */}
        {(status === "Completed" || status === "CompletedNoDocs" || status === "Empty") && (
          <div className="text-center">
            <div
              className={
                status === "Completed"
                  ? "bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm text-green-500"
                  : "bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-500"
              }
            >
              {status === "Completed"
                ? (t("home.repository.status.completedTip") || "Redirecting to documentation...")
                : (t("home.repository.status.completedNoDocsTip") || "Completed, but no documents are available yet.")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
