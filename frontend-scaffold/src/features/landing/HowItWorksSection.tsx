import React from 'react';
import { motion } from 'framer-motion';
import { Wallet, User, Link, Zap } from 'lucide-react';

interface Step {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    number: 1,
    icon: <Wallet className="w-6 h-6" />,
    title: 'Connect your Stellar wallet',
    description: 'Link your Freighter or other Stellar wallet to get started in seconds.',
  },
  {
    number: 2,
    icon: <User className="w-6 h-6" />,
    title: 'Register your profile',
    description: 'Create your unique creator profile with a custom username and bio.',
  },
  {
    number: 3,
    icon: <Link className="w-6 h-6" />,
    title: 'Share your tip link',
    description: 'Share your personalized tip link on social media, streams, or anywhere.',
  },
  {
    number: 4,
    icon: <Zap className="w-6 h-6" />,
    title: 'Receive XLM tips!',
    description: 'Supporters send XLM tips directly to your wallet — instant and fee-free.',
  },
];

const stepVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.15,
      duration: 0.4,
      ease: 'easeOut' as const,
    },
  }),
};

const HowItWorksSection: React.FC = () => {
  return (
    <section className="py-20 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="text-3xl md:text-4xl font-bold text-center mb-4"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          HOW IT WORKS
        </motion.h2>
        <motion.p
          className="text-gray-500 text-center mb-16 max-w-xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Start receiving tips in four simple steps
        </motion.p>

        {/* Desktop: horizontal layout */}
        <div className="hidden md:flex items-start justify-between gap-4">
          {steps.map((step, i) => (
            <React.Fragment key={step.number}>
              <motion.div
                className="flex flex-col items-center text-center flex-1"
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={stepVariants}
              >
                <div className="relative mb-4">
                  <div className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">
                    {step.number}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    {step.icon}
                  </div>
                </div>
                <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-[200px]">
                  {step.description}
                </p>
              </motion.div>

              {/* Connecting line between steps */}
              {i < steps.length - 1 && (
                <motion.div
                  className="flex-shrink-0 mt-7 w-12 h-0.5 bg-indigo-200"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: (i + 1) * 0.15, duration: 0.3 }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Mobile: vertical layout */}
        <div className="flex flex-col gap-8 md:hidden">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="flex items-start gap-4"
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stepVariants}
            >
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center text-base font-bold">
                  {step.number}
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  {step.icon}
                </div>
                {/* Vertical connecting line */}
                {i < steps.length - 1 && (
                  <div className="absolute top-14 left-1/2 -translate-x-1/2 w-0.5 h-8 bg-indigo-200" />
                )}
              </div>
              <div className="pt-1">
                <h3 className="font-semibold text-base mb-1">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
