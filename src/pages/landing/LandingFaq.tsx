import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { cn } from "@/lib/utils";
import { FAQS } from "@/pages/landing/landingFaqData";

export function LandingFaq() {
  const [openFaq, setOpenFaq] = useState<string | null>(FAQS[0]?.q ?? null);
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="faq"
      className="mt-12 scroll-mt-20 border-t border-white/8 bg-white/[0.02]"
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8 sm:py-24">
        <LandingSectionTitle
          align="center"
          eyebrow="Dúvidas"
          title="Perguntas frequentes"
        />
        <div className="mt-10 space-y-2">
          {FAQS.map((item) => {
            const open = openFaq === item.q;
            return (
              <div
                key={item.q}
                className="rounded-xl border border-white/10 bg-black/20"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? null : item.q)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium text-zinc-100 sm:px-5 sm:text-base"
                >
                  {item.q}
                  <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={
                      reduceMotion ? { duration: 0 } : { duration: 0.2 }
                    }
                    className="shrink-0 text-zinc-500"
                  >
                    <ChevronDown className="size-4" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      key="content"
                      initial={
                        reduceMotion ? false : { height: 0, opacity: 0 }
                      }
                      animate={{ height: "auto", opacity: 1 }}
                      exit={
                        reduceMotion
                          ? { opacity: 0 }
                          : { height: 0, opacity: 0 }
                      }
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p
                        className={cn(
                          "px-4 pb-4 text-sm leading-relaxed text-zinc-400 sm:px-5"
                        )}
                      >
                        {item.a}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
