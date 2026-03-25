import { redirect } from "next/navigation";
import { fetchRepoTree } from "@/lib/repository-api";
import { DocNotFound } from "@/components/repo/doc-not-found";
import { buildRepoDocPath, decodeRouteSegment } from "@/lib/repo-route";

interface RepoIndexProps {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

async function getTreeData(owner: string, repo: string) {
  try {
    console.debug("[WIKI][RepoIndex] Fetching tree for index redirect", { owner, repo });
    return await fetchRepoTree(owner, repo);
  } catch (error) {
    console.error("[WIKI][RepoIndex] Failed to fetch tree for index redirect", { owner, repo, error });
    return null;
  }
}

export default async function RepoIndex({ params }: RepoIndexProps) {
  const { owner, repo } = await params;
  const decodedOwner = decodeRouteSegment(owner);
  const decodedRepo = decodeRouteSegment(repo);
  console.debug("[WIKI][RepoIndex] Route resolved", { owner, repo, decodedOwner, decodedRepo });
  
  const tree = await getTreeData(decodedOwner, decodedRepo);
  
  // API错误，layout会处理
  if (!tree) {
    console.warn("[WIKI][RepoIndex] Tree payload missing, defer to layout", { decodedOwner, decodedRepo });
    return null;
  }
  
  // 仓库不存在，layout会处理
  if (!tree.exists) {
    console.warn("[WIKI][RepoIndex] Tree indicates repo not exists, defer to layout", { decodedOwner, decodedRepo });
    return null;
  }

  // 仓库正在处理中、等待处理或失败，layout会处理显示
  if (tree.statusName !== "Completed") {
    console.info("[WIKI][RepoIndex] Repo not completed yet, defer to layout", {
      decodedOwner,
      decodedRepo,
      statusName: tree.statusName,
    });
    return null;
  }

  // 有默认文档，重定向
  if (tree.defaultSlug) {
    console.debug("[WIKI][RepoIndex] Redirecting to default slug", {
      decodedOwner,
      decodedRepo,
      defaultSlug: tree.defaultSlug,
    });
    redirect(buildRepoDocPath(decodedOwner, decodedRepo, tree.defaultSlug));
  }

  // 没有默认文档但有目录，显示提示
  if (tree.nodes.length > 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <DocNotFound slug="" />
      </div>
    );
  }

  // 空仓库，layout会处理
  return null;
}
