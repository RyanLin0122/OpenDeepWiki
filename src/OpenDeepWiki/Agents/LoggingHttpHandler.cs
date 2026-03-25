using System.Net;
using System.Text;

namespace OpenDeepWiki.Agents;

/// <summary>
/// 自定义 HTTP 消息处理器，用于拦截和记录请求/响应状态
/// 支持 502/429 错误自动重试
/// </summary>
public class LoggingHttpHandler(HttpMessageHandler innerHandler) : DelegatingHandler(innerHandler)
{
    private const int MaxRetryAttempts = 3;
    private static readonly TimeSpan DefaultRetryDelay = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan MaxRetryDelay = TimeSpan.FromSeconds(60);

    public LoggingHttpHandler() : this(new HttpClientHandler())
    {
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];
        var startTime = DateTime.UtcNow;

        Console.WriteLine($"[{requestId}] >>> 请求开始: {request.Method} {request.RequestUri}");

        var attempt = 0;
        HttpResponseMessage? response = null;

        while (attempt < MaxRetryAttempts)
        {
            attempt++;

            try
            {
                // 如果是重试，需要克隆请求（因为原请求可能已被消费）
                var requestToSend = attempt == 1 ? request : await CloneRequestAsync(request);

                response = await base.SendAsync(requestToSend, cancellationToken);

                // 检查是否需要重试
                if (ShouldRetry(response.StatusCode) && attempt < MaxRetryAttempts)
                {
                    var retryDelay = GetRetryDelay(response, attempt);
                    Console.WriteLine(
                        $"[{requestId}] !!! 收到 {(int)response.StatusCode} 响应，{retryDelay.TotalSeconds:F0}秒后进行第 {attempt + 1} 次重试...");

                    response.Dispose();
                    await Task.Delay(retryDelay, cancellationToken);
                    continue;
                }

                break;
            }
            catch (Exception ex) when (attempt < MaxRetryAttempts && IsTransientException(ex))
            {
                var retryDelay = GetExponentialDelay(attempt);
                Console.WriteLine(
                    $"[{requestId}] !!! 请求异常: {ex.Message}，{retryDelay.TotalSeconds:F0}秒后进行第 {attempt + 1} 次重试...");

                await Task.Delay(retryDelay, cancellationToken);
            }
            catch (Exception ex)
            {
                var elapsed = DateTime.UtcNow - startTime;
                Console.WriteLine($"[{requestId}] !!! 请求异常: {ex.Message} | 耗时: {elapsed.TotalMilliseconds:F0}ms");
                throw;
            }
        }

        var totalElapsed = DateTime.UtcNow - startTime;

        if (response != null)
        {
            Console.WriteLine(
                $"[{requestId}] <<< 响应完成: {(int)response.StatusCode} {response.StatusCode} | 耗时: {totalElapsed.TotalMilliseconds:F0}ms | 尝试次数: {attempt}");

            var responseContent = await ReadAndPreserveContentAsync(response, cancellationToken);
            //if (!string.IsNullOrWhiteSpace(responseContent))
            //{
            //    WriteYellowLine($"[{requestId}] <<< 响应JSON: {responseContent}");
            //}

            if (!response.IsSuccessStatusCode && !string.IsNullOrWhiteSpace(responseContent))
            {
                Console.WriteLine($"[{requestId}] !!! 错误响应: {responseContent[..Math.Min(500, responseContent.Length)]}");
            }
        }

        return response!;
    }

    private static bool ShouldRetry(HttpStatusCode statusCode)
    {
        var i = (int)statusCode;
        if (i >= 500)
        {
            return true;
        }

        return statusCode is HttpStatusCode.BadGateway or HttpStatusCode.TooManyRequests
            or HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout;
    }

    private static bool IsTransientException(Exception ex)
    {
        return ex is HttpRequestException or TaskCanceledException { InnerException: TimeoutException };
    }

    private static TimeSpan GetRetryDelay(HttpResponseMessage response, int attempt)
    {
        // 优先使用 Retry-After 头
        if (response.Headers.RetryAfter != null)
        {
            if (response.Headers.RetryAfter.Delta.HasValue)
            {
                var delay = response.Headers.RetryAfter.Delta.Value;
                return delay > MaxRetryDelay ? MaxRetryDelay : delay;
            }

            if (response.Headers.RetryAfter.Date.HasValue)
            {
                var delay = response.Headers.RetryAfter.Date.Value - DateTimeOffset.UtcNow;
                if (delay > TimeSpan.Zero)
                {
                    return delay > MaxRetryDelay ? MaxRetryDelay : delay;
                }
            }
        }

        // 使用指数退避
        return GetExponentialDelay(attempt);
    }

    private static TimeSpan GetExponentialDelay(int attempt)
    {
        var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt - 1) * DefaultRetryDelay.TotalSeconds);
        return delay > MaxRetryDelay ? MaxRetryDelay : delay;
    }

    private static async Task<HttpRequestMessage> CloneRequestAsync(HttpRequestMessage request)
    {
        var clone = new HttpRequestMessage(request.Method, request.RequestUri)
        {
            Version = request.Version
        };

        // 复制内容
        if (request.Content != null)
        {
            var content = await request.Content.ReadAsByteArrayAsync();
            clone.Content = new ByteArrayContent(content);

            // 复制内容头
            foreach (var header in request.Content.Headers)
            {
                clone.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }
        }

        // 复制请求头
        foreach (var header in request.Headers)
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        // 复制选项
        foreach (var option in request.Options)
        {
            clone.Options.TryAdd(option.Key, option.Value);
        }

        return clone;
    }

    private static async Task<string?> ReadAndPreserveContentAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        if (response.Content == null)
        {
            return null;
        }

        var contentType = response.Content.Headers.ContentType;
        var mediaType = contentType?.MediaType;
        var content = await response.Content.ReadAsStringAsync(cancellationToken);

        var charset = contentType?.CharSet;
        Encoding encoding;
        if (!string.IsNullOrWhiteSpace(charset))
        {
            try
            {
                encoding = Encoding.GetEncoding(charset);
            }
            catch
            {
                encoding = Encoding.UTF8;
            }
        }
        else
        {
            encoding = Encoding.UTF8;
        }

        response.Content = mediaType != null
            ? new StringContent(content, encoding, mediaType)
            : new StringContent(content, encoding);

        return content;
    }

    private static void WriteYellowLine(string message)
    {
        const string yellow = "\u001b[33m";
        const string reset = "\u001b[0m";
        Console.WriteLine($"{yellow}{message}{reset}");
    }
}
