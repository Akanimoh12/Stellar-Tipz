import React from 'react';
import { Sparkles, Zap, Globe, Trophy, Shield, ArrowRight, Github, Twitter } from 'lucide-react';
import { motion } from 'framer-motion';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 py-20">
        <div className="max-w-6xl mx-auto text-center">
          {/* Animated Logo/Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <h1 className="text-8xl md:text-9xl font-black mb-4 tracking-tight">
              TIPZ
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                className="inline-block ml-4"
              >
                💫
              </motion.span>
            </h1>
            <div className="h-2 w-32 bg-black mx-auto mb-8"></div>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-3xl md:text-5xl font-bold mb-6 max-w-4xl mx-auto leading-tight"
          >
            Empowering Creators Through
            <br />
            Decentralized Tipping
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-xl md:text-2xl mb-12 max-w-3xl mx-auto text-gray-700"
          >
            Send instant XLM tips to creators. Only 2% fees. 3-5 second finality.
            <br />
            Built on Stellar's lightning-fast blockchain.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
          >
            <button className="btn-brutalist text-lg group">
              Get Started
              <ArrowRight className="inline-block ml-2 group-hover:translate-x-1 transition-transform" size={20} />
            </button>
            <button className="btn-brutalist-outline text-lg">
              Learn More
            </button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto"
          >
            <div className="card-brutalist text-center">
              <div className="text-4xl font-black mb-2">2%</div>
              <div className="text-sm uppercase font-bold tracking-wide">Platform Fee</div>
              <div className="text-xs text-gray-600 mt-1">(vs 30-50% traditional)</div>
            </div>
            <div className="card-brutalist text-center">
              <div className="text-4xl font-black mb-2">3-5s</div>
              <div className="text-sm uppercase font-bold tracking-wide">Transaction Time</div>
              <div className="text-xs text-gray-600 mt-1">(vs 7-30 days traditional)</div>
            </div>
            <div className="card-brutalist text-center">
              <div className="text-4xl font-black mb-2">$0.0001</div>
              <div className="text-sm uppercase font-bold tracking-wide">Transaction Cost</div>
              <div className="text-xs text-gray-600 mt-1">(virtually free)</div>
            </div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1 }}
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="w-6 h-10 border-2 border-black rounded-full flex items-start justify-center p-2"
          >
            <div className="w-1 h-2 bg-black rounded-full"></div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-off-white border-t-3 border-b-3 border-black">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-black text-center mb-16"
          >
            WHY TIPZ?
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Zap size={40} />,
                title: "Lightning Fast",
                description: "3-5 second finality. Tips arrive instantly, not in weeks."
              },
              {
                icon: <Sparkles size={40} />,
                title: "Minimal Fees",
                description: "Only 2% withdrawal fee. Keep 98% of what you earn."
              },
              {
                icon: <Globe size={40} />,
                title: "Global Access",
                description: "Borderless payments. Anyone, anywhere, anytime."
              },
              {
                icon: <Trophy size={40} />,
                title: "Credit Score",
                description: "Transparent credibility based on X (Twitter) metrics."
              },
              {
                icon: <Shield size={40} />,
                title: "Fully On-Chain",
                description: "All transactions transparent and verifiable on Stellar."
              },
              {
                icon: <Sparkles size={40} />,
                title: "Simple URLs",
                description: "Share your tipz.app/@username everywhere."
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="card-brutalist hover:-translate-x-1 hover:-translate-y-1 transition-transform duration-200"
              >
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-2xl font-bold mb-3 uppercase">{feature.title}</h3>
                <p className="text-gray-700">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-black text-center mb-16"
          >
            HOW IT WORKS
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                step: "1",
                title: "Register",
                description: "Connect your wallet and link your X account to get started."
              },
              {
                step: "2",
                title: "Share",
                description: "Share your unique tipz.app/@username link everywhere."
              },
              {
                step: "3",
                title: "Receive",
                description: "Get instant XLM tips from supporters worldwide."
              },
              {
                step: "4",
                title: "Withdraw",
                description: "Cash out anytime. Pay only 2% fee. Keep the rest."
              }
            ].map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                <div className="card-brutalist text-center">
                  <div className="text-6xl font-black mb-4 text-gray-300">
                    {step.step}
                  </div>
                  <h3 className="text-2xl font-bold mb-3 uppercase">{step.title}</h3>
                  <p className="text-gray-700">{step.description}</p>
                </div>
                {index < 3 && (
                  <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <ArrowRight size={32} className="text-black" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-20 px-4 bg-off-white border-t-3 border-b-3 border-black">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-black text-center mb-16"
          >
            TIPZ VS TRADITIONAL
          </motion.h2>

          <div className="card-brutalist overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left py-4 px-4 font-black uppercase">Feature</th>
                  <th className="text-left py-4 px-4 font-black uppercase">Traditional</th>
                  <th className="text-left py-4 px-4 font-black uppercase bg-black text-white">Tipz</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: "Fees", traditional: "30-50%", tipz: "2%", highlight: true },
                  { feature: "Settlement", traditional: "7-30 days", tipz: "3-5 seconds", highlight: true },
                  { feature: "Access", traditional: "Regional", tipz: "Global", highlight: false },
                  { feature: "Transparency", traditional: "Hidden", tipz: "On-Chain", highlight: false },
                ].map((row, index) => (
                  <tr key={index} className="border-b border-gray-300">
                    <td className="py-4 px-4 font-bold">{row.feature}</td>
                    <td className="py-4 px-4 text-gray-600">{row.traditional}</td>
                    <td className={`py-4 px-4 font-bold ${row.highlight ? 'text-green-600' : ''}`}>
                      {row.tipz}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8 text-center"
          >
            <div className="inline-block card-brutalist bg-black text-white px-8 py-4">
              <p className="text-2xl font-black">
                95% SAVINGS | 10,000x FASTER
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-5xl md:text-6xl font-black mb-6">
              JOIN THE REVOLUTION
            </h2>
            <p className="text-xl md:text-2xl mb-12 text-gray-700">
              Built for the Scaffold Stellar Hackathon.
              <br />
              Launching on Testnet soon.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <button className="btn-brutalist text-lg group">
                Get Early Access
                <ArrowRight className="inline-block ml-2 group-hover:translate-x-1 transition-transform" size={20} />
              </button>
              <button className="btn-brutalist-outline text-lg">
                View on GitHub
              </button>
            </div>

            {/* Built On */}
            <div className="mt-16 pt-8 border-t-2 border-black">
              <p className="text-sm uppercase font-bold tracking-wide mb-4">Powered By</p>
              <div className="flex flex-wrap justify-center gap-8 items-center">
                <span className="text-xl font-bold">⭐ Stellar</span>
                <span className="text-xl font-bold">🔮 Soroban</span>
                <span className="text-xl font-bold">🛠️ Scaffold Stellar</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-3 border-black bg-black text-white py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="text-3xl font-black mb-4">TIPZ 💫</h3>
              <p className="text-gray-400">
                Empowering creators through decentralized tipping on Stellar.
              </p>
            </div>
            <div>
              <h4 className="font-bold uppercase mb-4">Links</h4>
              <ul className="space-y-2">
                <li><a href="#about" className="hover:underline">About</a></li>
                <li><a href="#how-it-works" className="hover:underline">How It Works</a></li>
                <li><a href="https://github.com/Akanimoh12/Stellar-Tipz/blob/main/README.md" className="hover:underline">Documentation</a></li>
                <li><a href="https://github.com/Akanimoh12/Stellar-Tipz/issues" className="hover:underline">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold uppercase mb-4">Connect</h4>
              <div className="flex gap-4">
                <a href="https://github.com/Akanimoh12/Stellar-Tipz" target="_blank" rel="noopener noreferrer" className="hover:-translate-y-1 transition-transform">
                  <Github size={24} />
                </a>
                <a href="https://twitter.com/TipzApp" target="_blank" rel="noopener noreferrer" className="hover:-translate-y-1 transition-transform">
                  <Twitter size={24} />
                </a>
              </div>
            </div>
          </div>
          <div className="text-center text-gray-400 text-sm pt-8 border-t border-gray-700">
            <p>© 2025 Stellar Tipz. Built with ❤️ for Scaffold Stellar Hackathon.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
