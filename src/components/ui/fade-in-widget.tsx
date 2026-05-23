"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export function usePortalReducedMotion() {
  const systemReduced = useReducedMotion();
  const [userReduced, setUserReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const checkClass = () => {
      setUserReduced(document.documentElement.classList.contains("reduce-motion"));
    };

    checkClass();

    const observer = new MutationObserver(checkClass);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return systemReduced || userReduced;
}

export function FadeInWidget({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const shouldReduce = usePortalReducedMotion();

  return (
    <motion.div
      initial={shouldReduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduce ? { duration: 0 } : { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: 0.1,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function FadeInItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const shouldReduce = usePortalReducedMotion();

  return (
    <motion.div
      variants={{
        hidden: { opacity: shouldReduce ? 1 : 0, y: shouldReduce ? 0 : 15 },
        show: { 
          opacity: 1, 
          y: 0, 
          transition: { duration: shouldReduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] } 
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
