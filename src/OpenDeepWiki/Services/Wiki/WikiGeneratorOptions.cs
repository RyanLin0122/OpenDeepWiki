using OpenDeepWiki.Agents;

namespace OpenDeepWiki.Services.Wiki;

/// <summary>
/// Configuration options for the Wiki Generator.
/// Supports separate model configurations for catalog and content generation.
/// </summary>
public class WikiGeneratorOptions
{
    /// <summary>
    /// Configuration section name in appsettings.json.
    /// </summary>
    public const string SectionName = "WikiGenerator";

    /// <summary>
    /// The AI model to use for catalog structure generation.
    /// Default: gpt-4o-mini (faster and cheaper for structural tasks).
    /// </summary>
    public string CatalogModel { get; set; } = "gpt-5-mini";

    /// <summary>
    /// The AI model to use for document content generation.
    /// Default: gpt-4o (better quality for content generation).
    /// </summary>
    public string ContentModel { get; set; } = "gpt-5.2";

    /// <summary>
    /// Optional custom endpoint for catalog generation.
    /// If not set, falls back to the default AI endpoint.
    /// </summary>
    public string? CatalogEndpoint { get; set; }

    /// <summary>
    /// Optional custom endpoint for content generation.
    /// If not set, falls back to the default AI endpoint.
    /// </summary>
    public string? ContentEndpoint { get; set; }

    /// <summary>
    /// Optional API key for catalog generation.
    /// If not set, falls back to the default AI API key.
    /// </summary>
    public string? CatalogApiKey { get; set; }

    /// <summary>
    /// Optional API key for content generation.
    /// If not set, falls back to the default AI API key.
    /// </summary>
    public string? ContentApiKey { get; set; }

    /// <summary>
    /// The directory containing prompt template files.
    /// Default: prompts
    /// </summary>
    public string PromptsDirectory { get; set; } = "prompts";

    /// <summary>
    /// Maximum retry attempts for AI generation operations.
    /// Default: 3
    /// </summary>
    public int MaxRetryAttempts { get; set; } = 3;

    /// <summary>
    /// Delay between retry attempts in milliseconds.
    /// Default: 1000
    /// </summary>
    public int RetryDelayMs { get; set; } = 1000;

    /// <summary>
    /// Maximum number of parallel document generation tasks.
    /// Default: 3. Can be configured via WIKI_PARALLEL_COUNT environment variable.
    /// </summary>
    public int ParallelCount { get; set; } = GetParallelCountFromEnv();

    /// <summary>
    /// Maximum output tokens for AI generation.
    /// Default: 32000
    /// </summary>
    public int MaxOutputTokens { get; set; } = 32000;

    /// <summary>
    /// Timeout in minutes for document generation tasks.
    /// Default: 30 minutes
    /// </summary>
    public int DocumentGenerationTimeoutMinutes { get; set; } = 60;

    /// <summary>
    /// Timeout in minutes for translation tasks.
    /// Default: 20 minutes
    /// </summary>
    public int TranslationTimeoutMinutes { get; set; } = 45;

    /// <summary>
    /// Timeout in minutes for catalog title translation tasks.
    /// Default: 2 minutes
    /// </summary>
    public int TitleTranslationTimeoutMinutes { get; set; } = 2;

    /// <summary>
    /// Maximum length for README content before truncation.
    /// Default: 4000 characters
    /// </summary>
    public int ReadmeMaxLength { get; set; } = 4000;

    /// <summary>
    /// Maximum depth for directory tree traversal.
    /// Default: 2 levels
    /// </summary>
    public int DirectoryTreeMaxDepth { get; set; } = 2;

    /// <summary>
    /// Comma-separated list of language codes for multi-language wiki generation.
    /// Example: "en,zh,ja,ko". Can be configured via WIKI_LANGUAGES environment variable.
    /// The primary language selected by user will be generated first, then translated to other languages.
    /// </summary>
    public string? Languages { get; set; } = "en,zh,ja,ko";

    /// <summary>
    /// The request type for catalog generation (e.g., OpenAI, Azure, Claude).
    /// If not set, uses the default request type.
    /// </summary>
    public AiRequestType? CatalogRequestType { get; set; } = AiRequestType.Anthropic;

    /// <summary>
    /// The request type for content generation (e.g., OpenAI, Azure, Claude).
    /// If not set, uses the default request type.
    /// </summary>
    public AiRequestType? ContentRequestType { get; set; } = AiRequestType.Anthropic;

    /// <summary>
    /// The AI model to use for translation.
    /// Default: uses ContentModel if not specified.
    /// </summary>
    public string? TranslationModel { get; set; }

    /// <summary>
    /// Optional custom endpoint for translation.
    /// If not set, falls back to ContentEndpoint.
    /// </summary>
    public string? TranslationEndpoint { get; set; }

    /// <summary>
    /// Optional API key for translation.
    /// If not set, falls back to ContentApiKey.
    /// </summary>
    public string? TranslationApiKey { get; set; }

    /// <summary>
    /// The request type for translation (e.g., OpenAI, Azure, Claude).
    /// If not set, falls back to ContentRequestType.
    /// </summary>
    public AiRequestType? TranslationRequestType { get; set; } = AiRequestType.Anthropic;

    /// <summary>
    /// Gets the list of target languages for translation (excluding the primary language).
    /// </summary>
    /// <param name="primaryLanguage">The primary language code to exclude.</param>
    /// <returns>List of language codes to translate to.</returns>
    public List<string> GetTranslationLanguages(string primaryLanguage)
    {
        if (string.IsNullOrWhiteSpace(Languages))
        {
            return new List<string>();
        }

        return Languages
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(l => l.ToLowerInvariant())
            .Where(l => !string.Equals(l, primaryLanguage, StringComparison.OrdinalIgnoreCase))
            .Distinct()
            .ToList();
    }

    /// <summary>
    /// Gets the parallel count from environment variable or returns default value.
    /// </summary>
    private static int GetParallelCountFromEnv()
    {
        var envValue = Environment.GetEnvironmentVariable("WIKI_PARALLEL_COUNT");
        if (!string.IsNullOrEmpty(envValue) && int.TryParse(envValue, out var count) && count > 0)
        {
            return count;
        }

        return 5; // Default value
    }

    /// <summary>
    /// Gets the AiRequestOptions for catalog generation.
    /// </summary>
    /// <returns>AiRequestOptions configured for catalog generation.</returns>
    public Agents.AiRequestOptions GetCatalogRequestOptions()
    {
        return new Agents.AiRequestOptions
        {
            Endpoint = CatalogEndpoint,
            ApiKey = CatalogApiKey,
            RequestType = CatalogRequestType
        };
    }

    /// <summary>
    /// Gets the AiRequestOptions for content generation.
    /// </summary>
    /// <returns>AiRequestOptions configured for content generation.</returns>
    public Agents.AiRequestOptions GetContentRequestOptions()
    {
        return new Agents.AiRequestOptions
        {
            Endpoint = ContentEndpoint,
            ApiKey = ContentApiKey,
            RequestType = ContentRequestType
        };
    }

    /// <summary>
    /// Gets the AiRequestOptions for translation.
    /// Falls back to content options if translation-specific options are not set.
    /// </summary>
    /// <returns>AiRequestOptions configured for translation.</returns>
    public Agents.AiRequestOptions GetTranslationRequestOptions()
    {
        return new Agents.AiRequestOptions
        {
            Endpoint = TranslationEndpoint ?? ContentEndpoint,
            ApiKey = TranslationApiKey ?? ContentApiKey,
            RequestType = TranslationRequestType ?? ContentRequestType
        };
    }

    /// <summary>
    /// Gets the model to use for translation.
    /// Falls back to ContentModel if not specified.
    /// </summary>
    public string GetTranslationModel()
    {
        return string.IsNullOrWhiteSpace(TranslationModel) ? ContentModel : TranslationModel;
    }
}
