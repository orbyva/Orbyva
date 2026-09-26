export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
};

export type BlogPost = BlogPostMeta & {
  content: string;
};

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const trimmed = raw.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) {
    return { meta: {}, body: trimmed };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: trimmed };
  const fm = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).replace(/^\s*\n/, "");
  const meta: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return { meta, body };
}

const modules = import.meta.glob("../../content/blog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function loadPosts(): BlogPost[] {
  const posts: BlogPost[] = [];
  for (const [path, raw] of Object.entries(modules)) {
    const { meta, body } = parseFrontmatter(raw);
    const fileSlug = path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    const slug = meta.slug || fileSlug;
    if (!meta.title || !meta.description || !meta.datePublished) continue;
    posts.push({
      slug,
      title: meta.title,
      description: meta.description,
      datePublished: meta.datePublished,
      dateModified: meta.dateModified,
      author: meta.author,
      content: body,
    });
  }
  return posts.sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished)
  );
}

const POSTS = loadPosts();

export function listBlogPosts(): BlogPostMeta[] {
  return POSTS.map(({ content, ...meta }) => {
    void content;
    return meta;
  });
}

export function getBlogPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function blogPostPath(slug: string): string {
  return `/blog/${slug}`;
}
