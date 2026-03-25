namespace OpenDeepWiki.Models;

/// <summary>
/// 仓库目录树节点
/// </summary>
public class RepositoryTreeNodeResponse
{
    /// <summary>
    /// 显示名称
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// 路由 slug
    /// </summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>
    /// 当前节点是否有文档内容
    /// </summary>
    public bool HasContent { get; set; }

    /// <summary>
    /// 当前节点可跳转的目标 slug（优先自身，否则第一个有内容的子节点）
    /// </summary>
    public string? TargetSlug { get; set; }

    /// <summary>
    /// 子节点
    /// </summary>
    public List<RepositoryTreeNodeResponse> Children { get; set; } = [];
}
