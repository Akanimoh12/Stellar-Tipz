import React, { useState } from 'react';
import { Copy, Check, Code, Settings, BookOpen } from 'lucide-react';

import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

const BASE_URL = 'https://tipz.app';

interface SizePreset {
  label: string;
  width: number;
  height: number;
}

const SIZE_PRESETS: SizePreset[] = [
  { label: 'Small',  width: 240, height: 320 },
  { label: 'Medium', width: 300, height: 400 },
  { label: 'Large',  width: 380, height: 500 },
];

interface EmbedCodeGeneratorProps {
  username: string;
}

const EmbedCodeGenerator: React.FC<EmbedCodeGeneratorProps> = ({ username }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [presets, setPresets] = useState('5,10,20');
  const [sizePreset, setSizePreset] = useState<SizePreset>(SIZE_PRESETS[1]);
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'customize' | 'docs'>('customize');

  const width  = customWidth  ? Number(customWidth)  : sizePreset.width;
  const height = customHeight ? Number(customHeight) : sizePreset.height;

  const embedUrl  = `${BASE_URL}/embed/@${username}?theme=${theme}&presets=${presets}`;
  const embedCode = `<iframe\n  src="${embedUrl}"\n  width="${width}"\n  height="${height}"\n  frameborder="0"\n  title="Tip ${username} on Stellar Tipz"\n></iframe>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked in some contexts */
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex border-b-2 border-black">
        {([ 'customize', 'docs' ] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase border-b-2 -mb-[2px] transition-colors ${
              activeTab === tab
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-black'
            }`}
          >
            {tab === 'customize' ? <Settings size={14} /> : <BookOpen size={14} />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'customize' && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left: controls */}
          <div className="space-y-5">
            {/* Theme */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-widest text-gray-800 dark:text-gray-200">
                Theme
              </label>
              <div className="flex gap-2">
                {(['light', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`flex-1 p-3 border-2 border-black font-black uppercase text-sm ${
                      theme === t ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-50'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Size presets */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-widest text-gray-800 dark:text-gray-200">
                Size
              </label>
              <div className="flex gap-2">
                {SIZE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => { setSizePreset(p); setCustomWidth(''); setCustomHeight(''); }}
                    className={`flex-1 p-2 border-2 border-black text-xs font-black uppercase ${
                      sizePreset.label === p.label && !customWidth && !customHeight
                        ? 'bg-black text-white'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {p.label}
                    <span className="block text-[10px] opacity-60 normal-case font-normal">
                      {p.width}×{p.height}
                    </span>
                  </button>
                ))}
              </div>
              {/* Custom dimensions */}
              <div className="flex gap-2 mt-2">
                <Input
                  label="Custom W"
                  type="number"
                  min={160}
                  max={800}
                  placeholder={String(sizePreset.width)}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                />
                <Input
                  label="Custom H"
                  type="number"
                  min={240}
                  max={1000}
                  placeholder={String(sizePreset.height)}
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                />
              </div>
            </div>

            {/* Preset amounts */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-widest text-gray-800 dark:text-gray-200">
                Preset Amounts (comma separated)
              </label>
              <Input
                value={presets}
                onChange={(e) => setPresets(e.target.value)}
                placeholder="e.g. 5,10,20"
              />
            </div>

            {/* Embed code */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-widest text-gray-800 dark:text-gray-200">
                Embed Code
              </label>
              <div className="relative">
                <textarea
                  readOnly
                  value={embedCode}
                  rows={6}
                  className="w-full bg-gray-50 border-2 border-black p-3 font-mono text-xs focus:outline-none resize-none"
                />
                <button
                  onClick={handleCopy}
                  className="absolute right-2 bottom-2 p-2 bg-black text-white hover:bg-gray-800 transition-colors"
                  title="Copy to clipboard"
                  aria-label="Copy embed code"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <Button
                onClick={handleCopy}
                className="w-full"
                icon={copied ? <Check size={18} /> : <Copy size={18} />}
              >
                {copied ? 'Copied!' : 'Copy Embed Code'}
              </Button>
            </div>
          </div>

          {/* Right: live preview */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-black uppercase flex items-center gap-2">
                <Code size={20} /> Live Preview
              </h3>
              <p className="text-sm font-bold text-gray-600 mt-1">
                Showing {width}×{height}px
              </p>
            </div>

            <div className="flex justify-center border-4 border-dashed border-gray-200 p-6 bg-gray-50 min-h-[480px] items-center">
              <div className="shadow-2xl overflow-hidden" style={{ width, maxWidth: '100%' }}>
                <iframe
                  title="Embed Preview"
                  src={`/embed/@${username}?theme=${theme}&presets=${presets}`}
                  width={width}
                  height={height}
                  style={{ border: 'none', display: 'block', maxWidth: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'docs' && (
        <div className="space-y-6 max-w-xl">
          <div>
            <h3 className="text-xl font-black uppercase">Usage</h3>
            <p className="text-sm text-gray-700 mt-2 leading-relaxed">
              Paste the generated <code className="font-mono bg-gray-100 px-1">{'<iframe>'}</code> tag into any HTML page to embed a tipping widget for <strong>@{username}</strong>.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-black uppercase">Query parameters</h4>
            <div className="border-2 border-black overflow-hidden">
              {[
                ['theme', 'light | dark', 'Widget colour scheme'],
                ['presets', '5,10,20', 'Comma-separated XLM preset amounts'],
                ['username', username, 'Creator username (set via path)'],
              ].map(([param, example, desc]) => (
                <div key={param} className="flex border-b-2 border-black last:border-0">
                  <div className="w-28 shrink-0 px-3 py-2 bg-gray-50 border-r-2 border-black font-mono text-xs font-bold">{param}</div>
                  <div className="px-3 py-2 flex-1">
                    <p className="text-xs font-bold">{desc}</p>
                    <p className="text-[10px] text-gray-500 font-mono">{example}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-black uppercase">Embed URL format</h4>
            <pre className="bg-gray-50 border-2 border-black p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {`${BASE_URL}/embed/@{username}?theme=light&presets=5,10,20`}
            </pre>
          </div>

          <div className="border-l-4 border-black pl-4 space-y-1">
            <p className="text-xs font-black uppercase">Heads up</p>
            <p className="text-xs text-gray-600">
              Wallet connection inside the iframe redirects visitors to the full tip page, where they can complete the transaction.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmbedCodeGenerator;
