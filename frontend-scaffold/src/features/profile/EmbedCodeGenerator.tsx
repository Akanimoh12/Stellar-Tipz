import React, { useState } from 'react';
import { Copy, Check, Code, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';

interface EmbedCodeGeneratorProps {
  username: string;
}

const EmbedCodeGenerator: React.FC<EmbedCodeGeneratorProps> = ({ username }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [presets, setPresets] = useState('5,10,20');
  const [copied, setCopied] = useState(false);

  const embedUrl = `https://tipz.app/embed/@${username}?theme=${theme}&presets=${presets}`;
  const embedCode = `<iframe src="${embedUrl}" width="300" height="400" frameborder="0"></iframe>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-black uppercase flex items-center gap-2">
              <Settings size={20} /> Customize Widget
            </h3>
            <p className="text-sm font-bold text-gray-500 mt-1">
              Configure how your tipping widget looks on your site.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-black uppercase tracking-widest text-gray-500">
              Theme
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 p-3 border-2 border-black font-black uppercase text-sm ${
                  theme === 'light' ? 'bg-black text-white' : 'bg-white text-black'
                }`}
              >
                Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 p-3 border-2 border-black font-black uppercase text-sm ${
                  theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'
                }`}
              >
                Dark
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-widest text-gray-500">
              Preset Amounts (comma separated)
            </label>
            <Input
              value={presets}
              onChange={(e) => setPresets(e.target.value)}
              placeholder="e.g. 5,10,20"
              className="font-black"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-widest text-gray-500">
              Embed Code
            </label>
            <div className="relative">
              <textarea
                readOnly
                value={embedCode}
                className="w-full h-24 bg-gray-50 border-2 border-black p-3 font-mono text-xs focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className="absolute right-2 bottom-2 p-2 bg-black text-white border border-black hover:bg-gray-800 transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          <Button
            onClick={handleCopy}
            className="w-full btn-brutalist flex items-center justify-center gap-2"
            icon={copied ? <Check size={18} /> : <Copy size={18} />}
          >
            {copied ? 'Copied Code!' : 'Copy Embed Code'}
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-black uppercase flex items-center gap-2">
              <Code size={20} /> Preview
            </h3>
            <p className="text-sm font-bold text-gray-500 mt-1">
              This is how it will appear on your website.
            </p>
          </div>

          <div className="flex justify-center border-4 border-dashed border-gray-200 p-8 bg-gray-50 min-h-[450px] items-center">
            <div className="shadow-2xl">
              <iframe
                title="Embed Preview"
                src={`/embed/@${username}?theme=${theme}&presets=${presets}`}
                width="300"
                height="400"
                style={{ border: 'none' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmbedCodeGenerator;
