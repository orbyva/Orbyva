import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
      className="mt-4 scroll-mt-24 border-t border-white/8 bg-white/[0.02]"
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8 sm:py-28">
        <LandingSectionTitle title="Perguntas frequentes" />
        <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
          {FAQS.map((item) => {
            const open = openFaq === item.q;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? null : item.q)}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-zinc-100 sm:text-base"
                >
                  {item.q}
                  <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.3, ease: [0.32, 0.72, 0, 1] }
                    }
                    className="shrink-0 text-zinc-500"
                  >
                    <ChevronDown className="size-4" />
                  </motion.span>
                </button>
                <div
                  className={cn(
                    "grid",
                    reduceMotion
                      ? open
                        ? "grid-rows-[1fr]"
                        : "grid-rows-[0fr]"
                      : "transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    !reduceMotion && (open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
                  )}
                >
                  <div className="overflow-hidden" aria-hidden={!open}>
                    <p className="pb-4 text-sm leading-relaxed text-zinc-400">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
