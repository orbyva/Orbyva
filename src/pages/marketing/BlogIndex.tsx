import { Link } from "react-router-dom";
import { PublicPageShell } from "@/components/PublicPageShell";
import { PublicInternalNav } from "@/components/seo/PublicInternalNav";
import { JsonLd } from "@/components/seo/JsonLd";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { listBlogPosts, blogPostPath } from "@/content/blog";
import { buildOrganizationJsonLd, DEFAULT_OG_IMAGE } from "@/lib/seo";

export default function BlogIndexPage() {
  const posts = listBlogPosts();
  useDocumentMeta({
    title: "Blog · Orbyva",
    description:
      "Artigos sobre Life OS, organização pessoal, finanças e metas, pelo time Orbyva.",
    path: "/blog",
    image: DEFAULT_OG_IMAGE,
  });

  return (
    <PublicPageShell width="wide">
      <JsonLd data={buildOrganizationJsonLd()} />
      <PublicInternalNav current="/blog" className="mb-8" />
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Blog
      </h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Textos e guias sobre Life OS, organização pessoal, finanças e metas,
        sem keyword stuffing.
      </p>
      <ul className="mt-10 space-y-6">
        {posts.map((post) => (
          <li
            key={post.slug}
            className="border-b border-white/10 pb-6 last:border-0"
          >
            <Link
              to={blogPostPath(post.slug)}
              className="font-display text-xl font-semibold text-zinc-100 hover:text-sky-300"
            >
              {post.title}
            </Link>
            <p className="mt-2 text-sm text-zinc-400">{post.description}</p>
            <p className="mt-2 text-xs text-zinc-500">
              <time dateTime={post.datePublished}>{post.datePublished}</time>
              {post.author ? ` · ${post.author}` : null}
            </p>
          </li>
        ))}
      </ul>
    </PublicPageShell>
  );
}
