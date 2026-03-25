using OpenDeepWiki.Entities;

namespace OpenDeepWiki.Services.Repositories;

/// <summary>
/// 处理日志服务接口
/// </summary>
public interface IProcessingLogService
{
    /// <summary>
    /// 记录处理日志
    /// </summary>
    Task LogAsync(
        string repositoryId,
        ProcessingStep step,
        string message,
        bool isAiOutput = false,
        string? toolName = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// 获取仓库的处理日志
    /// </summary>
    Task<ProcessingLogResponse> GetLogsAsync(
        string repositoryId,
        DateTime? since = null,
        int limit = 100,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// 清除仓库的处理日志
    /// </summary>
    Task ClearLogsAsync(string repositoryId, CancellationToken cancellationToken = default);
}

/// <summary>
/// 处理日志响应
/// </summary>
public class ProcessingLogResponse
{
    public ProcessingStep CurrentStep { get; set; }
    public List<ProcessingLogItem> Logs { get; set; } = new();
    
    /// <summary>
    /// 文档生成进度 - 总数
    /// </summary>
    public int TotalDocuments { get; set; }
    
    /// <summary>
    /// 文档生成进度 - 已完成数
    /// </summary>
    public int CompletedDocuments { get; set; }

    /// <summary>
    /// 文档翻译进度 - 总数
    /// </summary>
    public int TotalTranslationDocuments { get; set; }

    /// <summary>
    /// 文档翻译进度 - 已完成数
    /// </summary>
    public int CompletedTranslationDocuments { get; set; }
    
    /// <summary>
    /// 处理开始时间（第一条日志的时间）
    /// </summary>
    public DateTime? StartedAt { get; set; }
}

/// <summary>
/// 处理日志项
/// </summary>
public class ProcessingLogItem
{
    public string Id { get; set; } = string.Empty;
    public ProcessingStep Step { get; set; }
    public string Message { get; set; } = string.Empty;
    public bool IsAiOutput { get; set; }
    public string? ToolName { get; set; }
    public DateTime CreatedAt { get; set; }
}
