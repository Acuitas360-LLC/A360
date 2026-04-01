import { motion } from "framer-motion";

export const Greeting = () => {
  return (
    <div
      className="mx-auto mt-4 flex size-full w-full max-w-5xl flex-col justify-center px-2 md:mt-16 md:px-4"
      key="overview"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="whitespace-nowrap text-[clamp(1.2rem,2.2vw,2rem)] leading-tight tracking-tight"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
      >
        <span className="font-semibold text-foreground">Hi,</span>
        <span className="ml-1 font-normal text-muted-foreground">what can I help you with?</span>
      </motion.div>
    </div>
  );
};
