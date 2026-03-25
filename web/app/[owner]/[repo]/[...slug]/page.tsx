import { fetchRepoDoc } from "@/lib/repository-api";
import { extractHeadings } from "@/lib/markdown";
import { MarkdownRenderer } from "@/components/repo/markdown-renderer";
import { DocNotFound } from "@/components/repo/doc-not-found";
import { SourceFiles } from "@/components/repo/source-files";
import { decodeRouteSegment } from "@/lib/repo-route";
import { cookies } from "next/headers";

interface RepoDocPageProps {
  params: Promise<{
    owner: string;
    repo: string;
    slug: string[];
  }>;
  searchParams: Promise<{
    branch?: string;
    lang?: string;
  }>;
}

async function getDocData(owner: string, repo: string, slug: string, branch?: string, lang?: string) {
  try {
    console.debug("[WIKI][RepoDocPage] Fetching doc", { owner, repo, slug, branch, lang });
    const doc = await fetchRepoDoc(owner, repo, slug, branch, lang);
    if (!doc.exists) {
      console.warn("[WIKI][RepoDocPage] Doc not exists", { owner, repo, slug, branch, lang });
      return null;
    }
    const headings = extractHeadings(doc.content, 3);
    console.debug("[WIKI][RepoDocPage] Doc fetched", {
      owner,
      repo,
      slug,
      branch,
      lang,
      headingCount: headings.length,
      sourceFileCount: doc.sourceFiles?.length ?? 0,
    });
    return { doc, headings };
  } catch (error) {
    console.error("[WIKI][RepoDocPage] Failed to fetch doc", { owner, repo, slug, branch, lang, error });
    return null;
  }
}

export default async function RepoDocPage({ params, searchParams }: RepoDocPageProps) {
  const { owner, repo, slug: slugParts } = await params;
  const decodedOwner = decodeRouteSegment(owner);
  const decodedRepo = decodeRouteSegment(repo);
  const resolvedSearchParams = await searchParams;
  const branch = resolvedSearchParams?.branch;
  const lang = resolvedSearchParams?.lang;
  const slug = slugParts.join("/");
  console.debug("[WIKI][RepoDocPage] Route resolved", {
    owner,
    repo,
    slug,
    decodedOwner,
    decodedRepo,
    branch,
    lang,
  });

  const data = await getDocData(decodedOwner, decodedRepo, slug, branch, lang);
  
  // 文档不存在，但保留侧边栏（由layout提供）
  if (!data) {
    console.warn("[WIKI][RepoDocPage] Rendering DocNotFound", { decodedOwner, decodedRepo, slug, branch, lang });
    return (
      <div className="mx-auto max-w-4xl">
        <DocNotFound slug={slug} />
      </div>
    );
  }

  const { doc, headings } = data;
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value === "en" ? "en" : "zh";
  const repoCopy = locale === "en"
    ? { tableOfContents: "Table of Contents" }
    : { tableOfContents: "目录" };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 xl:flex-row">
      <article className="min-w-0 flex-1">
        <MarkdownRenderer content={doc.content} language={locale} />
        <SourceFiles 
          files={doc.sourceFiles || []} 
          branch={branch}
        />
      </article>
      {headings.length > 0 && (
        <aside className="xl:w-64 xl:shrink-0">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4 xl:sticky xl:top-6">
            <div className="mb-3 text-sm font-semibold">{repoCopy.tableOfContents}</div>
            <nav className="space-y-2">
              {headings.map((heading) => (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  className="block text-sm text-muted-foreground hover:text-foreground"
                  style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}
                >
                  {heading.text}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  );
}
