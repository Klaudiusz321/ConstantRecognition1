import Link from 'next/link';

export const metadata = {
  title: "Blog | Inverse Symbolic Computation Articles",
  description: "Read articles about how to identify numerical constants, inverse symbolic calculation, and finding closed forms from decimal numbers.",
};

export default function BlogPage() {
  const posts = [
    {
      title: "How to identify a decimal number with open-source tools",
      date: "May 30, 2026",
      excerpt: "Encountered a strange float in your data? Learn how an inverse symbolic calculator can reverse-engineer it into an exact formula.",
      slug: "#"
    },
    {
      title: "Running exhaustive brute-force search in the browser via WebAssembly",
      date: "May 15, 2026",
      excerpt: "Why we abandoned backend hosting and built a PSLQ alternative that runs entirely on your local CPU and GPU.",
      slug: "#"
    }
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-20 text-slate-300">
      <h1 className="text-4xl font-bold text-white mb-12">Blog</h1>
      
      <div className="space-y-12">
        {posts.map((post, i) => (
          <article key={i} className="border-b border-slate-800 pb-12">
            <time className="text-sm text-slate-500 mb-2 block">{post.date}</time>
            <h2 className="text-2xl font-bold text-white mb-4 hover:text-blue-400 transition-colors">
              <Link href={post.slug}>{post.title}</Link>
            </h2>
            <p className="text-slate-400 mb-6">{post.excerpt}</p>
            <Link href={post.slug} className="text-blue-400 font-semibold hover:underline">
              Read more →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
