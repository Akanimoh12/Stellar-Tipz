import React, { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp, MessageCircle, ExternalLink } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import { usePageMeta } from "@/hooks/usePageMeta";
import { faqData, faqCategories, FaqItem } from "./faqData";

const HelpPage: React.FC = () => {
  usePageMeta({ title: "Help Center" });

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const filteredFaqs = useMemo<FaqItem[]>(() => {
    const q = searchQuery.toLowerCase();
    return faqData.filter((item) => {
      const matchesCategory =
        activeCategory === "All" || item.category === activeCategory;
      const matchesSearch =
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, activeCategory]);

  const toggleItem = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSubmitted(true);
    setContactForm({ name: "", email: "", message: "" });
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-label="Help center"
      className="min-h-screen bg-white dark:bg-black focus:outline-none"
    >
      <PageContainer>
        {/* Hero */}
        <div className="mb-10 border-b-4 border-black pb-8 dark:border-white">
          <h1 className="mb-2 text-4xl font-black uppercase tracking-tight dark:text-white">
            Help Center
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Find answers, guides, and support for Stellar Tipz.
          </p>
        </div>

        {/* Search */}
        <section aria-label="Search help articles" className="mb-8">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
              aria-hidden="true"
            />
            <input
              role="searchbox"
              type="search"
              aria-label="Search help articles"
              placeholder="Search help articles…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-2 border-black py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black dark:border-white dark:bg-black dark:text-white dark:focus:ring-white"
            />
          </div>
        </section>

        {/* Category filter */}
        <section aria-label="Filter by category" className="mb-8">
          <div className="flex flex-wrap gap-2">
            {faqCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                aria-pressed={activeCategory === cat}
                className={`border-2 border-black px-4 py-1.5 text-xs font-black uppercase tracking-wide transition-colors dark:border-white ${
                  activeCategory === cat
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "bg-white text-black hover:bg-gray-100 dark:bg-black dark:text-white dark:hover:bg-gray-900"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* FAQ list */}
        <section aria-label="Frequently asked questions" className="mb-16">
          <h2 className="mb-6 text-2xl font-black uppercase tracking-tight dark:text-white">
            FAQ
          </h2>

          {filteredFaqs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              No articles match your search. Try a different term or{" "}
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory("All");
                }}
                className="font-bold underline"
              >
                clear filters
              </button>
              .
            </p>
          ) : (
            <ul className="divide-y-2 divide-black border-2 border-black dark:divide-white dark:border-white">
              {filteredFaqs.map((item) => {
                const isOpen = expandedIds.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${item.id}`}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-bold transition-colors hover:bg-gray-50 dark:text-white dark:hover:bg-gray-900"
                    >
                      <span>
                        <span className="mr-2 text-xs font-black uppercase tracking-wide text-gray-400">
                          {item.category}
                        </span>
                        {item.question}
                      </span>
                      {isOpen ? (
                        <ChevronUp
                          size={18}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronDown
                          size={18}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                    {isOpen && (
                      <div
                        id={`faq-answer-${item.id}`}
                        role="region"
                        aria-label={item.question}
                        className="border-t-2 border-black bg-gray-50 px-5 py-4 text-sm leading-relaxed text-gray-700 dark:border-white dark:bg-gray-900 dark:text-gray-300"
                      >
                        {item.answer}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Community support */}
        <section
          aria-label="Community support"
          className="mb-16 border-2 border-black p-6 dark:border-white"
        >
          <h2 className="mb-3 text-xl font-black uppercase tracking-tight dark:text-white">
            Community Support
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            Didn't find your answer? Join our community for real-time help from
            other users and contributors.
          </p>
          <a
            href="https://discord.gg/stellardev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border-2 border-black bg-black px-5 py-2.5 text-sm font-black uppercase tracking-wide text-white transition-opacity hover:opacity-80 dark:border-white dark:bg-white dark:text-black"
          >
            <MessageCircle size={16} aria-hidden="true" />
            Join Stellar Discord
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </section>

        {/* Contact / feedback form */}
        <section
          aria-label="Contact and feedback form"
          className="mb-16 border-2 border-black p-6 dark:border-white"
        >
          <h2 className="mb-3 text-xl font-black uppercase tracking-tight dark:text-white">
            Contact Us
          </h2>
          <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">
            Have a suggestion or can't find what you need? Send us a message.
          </p>

          {contactSubmitted ? (
            <div
              role="status"
              aria-live="polite"
              className="border-2 border-black bg-yellow-300 p-4 font-black uppercase tracking-wide dark:border-white"
            >
              Message received! We'll get back to you soon.
            </div>
          ) : (
            <form
              onSubmit={handleContactSubmit}
              aria-label="Contact form"
              className="flex flex-col gap-4"
            >
              <label className="flex flex-col gap-1 text-xs font-black uppercase tracking-wide dark:text-white">
                Name
                <input
                  type="text"
                  required
                  value={contactForm.name}
                  onChange={(e) =>
                    setContactForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="border-2 border-black px-3 py-2 text-sm font-normal normal-case tracking-normal focus:outline-none focus:ring-2 focus:ring-black dark:border-white dark:bg-black dark:text-white dark:focus:ring-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-black uppercase tracking-wide dark:text-white">
                Email
                <input
                  type="email"
                  required
                  value={contactForm.email}
                  onChange={(e) =>
                    setContactForm((f) => ({ ...f, email: e.target.value }))
                  }
                  className="border-2 border-black px-3 py-2 text-sm font-normal normal-case tracking-normal focus:outline-none focus:ring-2 focus:ring-black dark:border-white dark:bg-black dark:text-white dark:focus:ring-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-black uppercase tracking-wide dark:text-white">
                Message
                <textarea
                  required
                  rows={4}
                  value={contactForm.message}
                  onChange={(e) =>
                    setContactForm((f) => ({ ...f, message: e.target.value }))
                  }
                  className="border-2 border-black px-3 py-2 text-sm font-normal normal-case tracking-normal focus:outline-none focus:ring-2 focus:ring-black dark:border-white dark:bg-black dark:text-white dark:focus:ring-white"
                />
              </label>
              <button
                type="submit"
                className="self-start border-2 border-black bg-black px-6 py-2.5 text-sm font-black uppercase tracking-wide text-white transition-opacity hover:opacity-80 dark:border-white dark:bg-white dark:text-black"
              >
                Send Message
              </button>
            </form>
          )}
        </section>
      </PageContainer>
    </main>
  );
};

export default HelpPage;
