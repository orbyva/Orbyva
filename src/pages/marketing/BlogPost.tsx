import { Link, Navigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PublicPageShell } from "@/components/PublicPageShell";
import { PublicInternalNav } from "@/components/seo/PublicInternalNav";
import { JsonLd } from "@/components/seo/JsonLd";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { getBlogPost, blogPostPath } from "@/content/blog";
import {
  buildBlogPostingJsonLd,
  buildOrganizationJsonLd,
  DEFAULT_OG_IMAGE,
} from "@/lib/seo";

export default function BlogPostPage() {
  const { slug = "" } = useParams();
  const post = getBlogPost(slug);

  useDocumentMeta({
    title: post ? `${post.title} · Orbyva` : "Artigo · Orbyva",
    description: post?.description,
    path: post ? blogPostPath(post.slug) : "/blog",
    image: DEFAULT_OG_IMAGE,
  });

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  const path = blogPostPath(post.slug);

  return (
    <PublicPageShell width="wide">
      <JsonLd
        data={[
          buildOrganizationJsonLd(),
          buildBlogPostingJsonLd({
            title: post.title,
            description: post.description,
            path,
            datePublished: post.datePublished,
            dateModified: post.dateModified,
            authorName: post.author,
          }),
        ]}
      />
      <PublicInternalNav className="mb-8" />
      <p className="text-sm text-zinc-500">
        <Link to="/blog" className="hover:text-zinc-300">
          Blog
        </Link>
        {" / "}
        <time dateTime={post.datePublished}>{post.datePublished}</time>
        {post.dateModified && post.dateModified !== post.datePublished ? (
          <>
            {" · atualizado "}
            <time dateTime={post.dateModified}>{post.dateModified}</time>
          </>
        ) : null}
      </p>
      <article className="mt-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          {post.title}
        </h1>
        <p className="mt-3 text-lg text-zinc-400">{post.description}</p>
        <div className="blog-article mt-10 max-w-none space-y-4 text-base leading-relaxed text-zinc-400 [&_a]:text-sky-400 [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-zinc-100 [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-white/10 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-white/10 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_strong]:text-zinc-200">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith("/")) {
                  return (
                    <Link to={href} className="text-sky-400 hover:underline">
                      {children}
                    </Link>
                  );
                }
                return (
                  <a
                    href={href}
                    className="text-sky-400 hover:underline"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {post.content}
          </ReactMarkdown>
        </div>
      </article>
    </PublicPageShell>
  );
}
