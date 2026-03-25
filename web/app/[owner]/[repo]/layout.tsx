import React from "react";
import { fetchRepoTree, fetchRepoBranches, checkGitHubRepo } from "@/lib/repository-api";
import { RepoShell } from "@/components/repo/repo-shell";
import { RepositoryProcessingStatus } from "@/components/repo/repository-processing-status";
import { RepositoryNotFound } from "@/components/repo/repository-not-found";
import { decodeRouteSegment } from "@/lib/repo-route";
import { cookies } from "next/headers";

// 禁用缓存
export const dynamic = "force-dynamic";

interface RepoLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

async function getTreeData(owner: string, repo: string) {
  try {
    console.debug("[WIKI][RepoLayout] Fetching tree", { owner, repo });
    const tree = await fetchRepoTree(owner, repo);
    console.debug("[WIKI][RepoLayout] Tree fetched", {
      owner,
      repo,
      exists: tree?.exists,
      statusName: tree?.statusName,
      nodeCount: tree?.nodes?.length,
      defaultSlug: tree?.defaultSlug,
      currentBranch: tree?.currentBranch,
      currentLanguage: tree?.currentLanguage,
    });
    return tree;
  } catch (error) {
    console.error("[WIKI][RepoLayout] Failed to fetch tree", { owner, repo, error });
    return null;
  }
}

async function getBranchesData(owner: string, repo: string) {
  try {
    console.debug("[WIKI][RepoLayout] Fetching branches", { owner, repo });
    const branches = await fetchRepoBranches(owner, repo);
    console.debug("[WIKI][RepoLayout] Branches fetched", {
      owner,
      repo,
      defaultBranch: branches?.defaultBranch,
      defaultLanguage: branches?.defaultLanguage,
      branchCount: branches?.branches?.length,
      languageCount: branches?.languages?.length,
    });
    return branches;
  } catch (error) {
    console.error("[WIKI][RepoLayout] Failed to fetch branches", { owner, repo, error });
    return null;
  }
}

async function getGitHubInfo(owner: string, repo: string) {
  try {
    console.debug("[WIKI][RepoLayout] Fetching GitHub fallback info", { owner, repo });
    const info = await checkGitHubRepo(owner, repo);
    console.debug("[WIKI][RepoLayout] GitHub fallback info fetched", {
      owner,
      repo,
      exists: info?.exists,
      isPrivate: info?.isPrivate,
      defaultBranch: info?.defaultBranch,
    });
    return info;
  } catch (error) {
    console.error("[WIKI][RepoLayout] Failed to fetch GitHub fallback info", { owner, repo, error });
    return null;
  }
}

export default async function RepoLayout({ children, params }: RepoLayoutProps) {
  const { owner, repo } = await params;
  console.debug("[WIKI][RepoLayout] Incoming route params", { owner, repo });
  const decodedOwner = decodeRouteSegment(owner);
  const decodedRepo = decodeRouteSegment(repo);
  console.debug("[WIKI][RepoLayout] Decoded route params", { decodedOwner, decodedRepo });

  const tree = await getTreeData(decodedOwner, decodedRepo);

  let content: React.ReactNode;

  // API请求失败或仓库不存在，检查GitHub
  if (!tree || !tree.exists) {
    console.warn("[WIKI][RepoLayout] Tree missing or repo not exists, using not-found view", {
      decodedOwner,
      decodedRepo,
      treeExists: tree?.exists ?? null,
    });
    const gitHubInfo = await getGitHubInfo(decodedOwner, decodedRepo);
    content = <RepositoryNotFound owner={decodedOwner} repo={decodedRepo} gitHubInfo={gitHubInfo} />;
  }
  // 仓库正在处理中或等待处理
  else if (tree.statusName === "Pending" || tree.statusName === "Processing" || tree.statusName === "Failed") {
    console.info("[WIKI][RepoLayout] Repository in non-completed state", {
      decodedOwner,
      decodedRepo,
      statusName: tree.statusName,
    });
    content = (
      <RepositoryProcessingStatus
        owner={decodedOwner}
        repo={decodedRepo}
        status={tree.statusName}
      />
    );
  }
  // 仓库已完成但没有文档
  else if (tree.nodes.length === 0) {
    console.warn("[WIKI][RepoLayout] Repository completed but no nodes", {
      decodedOwner,
      decodedRepo,
      statusName: tree.statusName,
    });
    content = (
      <RepositoryProcessingStatus
        owner={decodedOwner}
        repo={decodedRepo}
        status={
          tree.statusName === "CompletedNoDocs" || tree.statusName === "Empty"
            ? tree.statusName
            : "CompletedNoDocs"
        }
      />
    );
  }
  else {
    // 获取分支和语言数据
    const branches = await getBranchesData(decodedOwner, decodedRepo);
    const cookieStore = await cookies();
    const uiLocale = cookieStore.get("NEXT_LOCALE")?.value === "en" ? "en" : "zh";
    console.debug("[WIKI][RepoLayout] Rendering RepoShell", {
      decodedOwner,
      decodedRepo,
      uiLocale,
      nodeCount: tree.nodes.length,
      initialBranch: tree.currentBranch,
      initialLanguage: tree.currentLanguage,
      hasBranchesPayload: !!branches,
    });

    content = (
      <RepoShell
        owner={decodedOwner}
        repo={decodedRepo}
        initialNodes={tree.nodes}
        initialBranches={branches ?? undefined}
        initialBranch={tree.currentBranch}
        initialLanguage={tree.currentLanguage}
        uiLocale={uiLocale}
      >
        {children}
      </RepoShell>
    );
  }

  return content;
}
