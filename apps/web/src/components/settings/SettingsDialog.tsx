import { useState, useEffect } from "react";
import { X, Settings as SettingsIcon, Sliders, Database } from "lucide-react";
import { cn } from "../../lib/utils";
import { toastPromise } from "../../utils/toastPromise";
import { notify } from "../../utils/toast";
import { getSettings, saveSettings, type Settings } from "../../services/settings";

interface MemorySettings {
  enabled: boolean;
  tier1: {
    enabled: boolean;
    ttlDays: number;
    saveThreshold: number;
  };
  tier2: {
    enabled: boolean;
    ttlDays: number;
    saveThreshold: number;
  };
  tier3: {
    enabled: boolean;
    ttlDays: number;
    saveThreshold: number;
  };
  asyncRecall: {
    deadlineMs: number;
    maxItems: number;
  };
}

const defaultSettings: MemorySettings = {
  enabled: true,
  tier1: {
    enabled: true,
    ttlDays: 120,
    saveThreshold: 0.62,
  },
  tier2: {
    enabled: true,
    ttlDays: 365,
    saveThreshold: 0.70,
  },
  tier3: {
    enabled: true,
    ttlDays: 90,
    saveThreshold: 0.70,
  },
  asyncRecall: {
    deadlineMs: 30,
    maxItems: 5,
  },
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingRow: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className={cn(
    "rounded-lg border border-white/[0.06] p-4",
    "bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-150"
  )}>
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/80 font-medium mb-1">{label}</div>
        {description && (
          <div className="text-xs text-white/40">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">
        {children}
      </div>
    </div>
  </div>
);

const Toggle: React.FC<{
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}> = ({ checked, onCheckedChange }) => (
  <button
    role="switch"
    aria-checked={checked}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      "w-11 h-6 rounded-full transition-all duration-150 border",
      checked 
        ? "bg-white/20 border-white/30" 
        : "bg-white/[0.02] border-white/[0.08]"
    )}
  >
    <span
      className={cn(
        "block w-4 h-4 rounded-full bg-white transition-all duration-150",
        checked ? "translate-x-6" : "translate-x-1"
      )}
    />
  </button>
);

const Input: React.FC<{
  type?: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  step?: string;
}> = ({ type = "text", value, onChange, placeholder, step }) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    step={step}
    className={cn(
      "px-3 py-1.5 rounded border border-white/[0.08]",
      "bg-white/[0.02] hover:bg-white/[0.04] focus:bg-white/[0.06]",
      "text-white/90 text-sm",
      "focus:outline-none focus:ring-1 focus:ring-white/20",
      "transition-all duration-150",
      "w-24 tabular-nums"
    )}
  />
);

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<MemorySettings>(defaultSettings);
  const [generalSettings, setGeneralSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingGeneral, setLoadingGeneral] = useState(false);

  const updateSettings = (path: string[], value: any) => {
    setSettings((prev) => {
      const newSettings = { ...prev };
      let current: any = newSettings;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return newSettings;
    });
  };

  // Handle click outside to close
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const modal = document.querySelector('[data-settings-modal]');
      if (modal && !modal.contains(target)) {
        onOpenChange(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open && !generalSettings && !loadingGeneral) {
      setLoadingGeneral(true);
      void toastPromise(() => getSettings(), {
        loading: 'Loading settings…',
        success: 'Settings loaded',
        error: 'Failed to load settings',
      }).then((res) => {
        setGeneralSettings(res);
        setLoadingGeneral(false);
      });
    }
  }, [open, generalSettings, loadingGeneral]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (generalSettings) {
        const updated = await toastPromise(() => saveSettings(generalSettings), {
          loading: 'Saving…',
          success: 'Settings saved',
          error: 'Failed to save settings',
        });
        setGeneralSettings(updated);
      }

      await toastPromise(
        async () => {
          return await Promise.resolve(true);
        },
        {
          loading: 'Saving settings…',
          success: 'Settings saved',
          error: (e) => (e instanceof Error ? e.message : 'Failed to save settings'),
        }
      );
      notify.success('Preferences updated');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Modal */}
      <div
        data-settings-modal
        className="fixed left-20 top-0 bottom-0 z-[9999] w-[420px] bg-[#0a0a0a] border-r border-white/[0.08] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-white/90 rounded-full" />
            <h2 className="text-base font-medium text-white/90 tracking-tight">Settings</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded hover:bg-white/[0.06] transition-colors text-white/40 hover:text-white/70"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* General Settings Section */}
            {generalSettings && (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sliders className="w-4 h-4 text-white/50" />
                    <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">
                      General
                    </h3>
                  </div>

                  <div className="space-y-2">
                    <SettingRow
                      label="In-Chat Artifacts"
                      description="Show artifacts directly in chat messages"
                    >
                      <Toggle
                        checked={generalSettings.inChatArtifactsEnabled}
                        onCheckedChange={(checked) =>
                          setGeneralSettings({ ...generalSettings, inChatArtifactsEnabled: checked })
                        }
                      />
                    </SettingRow>

                    <SettingRow
                      label="Research Mode"
                      description="Enable real-time web research capabilities"
                    >
                      <Toggle
                        checked={generalSettings.researchEnabled}
                        onCheckedChange={(checked) =>
                          setGeneralSettings({ ...generalSettings, researchEnabled: checked })
                        }
                      />
                    </SettingRow>
                  </div>
                </div>

                <div className="h-px bg-white/[0.06]" />
              </>
            )}

            {/* Memory Settings Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-4 h-4 text-white/50" />
                <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Memory System
                </h3>
              </div>

              <div className="space-y-2">
                <SettingRow
                  label="Memory System"
                  description="Enable persistent conversation memory"
                >
                  <Toggle
                    checked={settings.enabled}
                    onCheckedChange={(checked) => updateSettings(['enabled'], checked)}
                  />
                </SettingRow>

                {settings.enabled && (
                  <>
                    <SettingRow
                      label="Tier 1 (Critical)"
                      description={`TTL: ${settings.tier1.ttlDays} days, Threshold: ${settings.tier1.saveThreshold}`}
                    >
                      <Toggle
                        checked={settings.tier1.enabled}
                        onCheckedChange={(checked) => updateSettings(['tier1', 'enabled'], checked)}
                      />
                    </SettingRow>

                    <SettingRow
                      label="Tier 2 (Important)"
                      description={`TTL: ${settings.tier2.ttlDays} days, Threshold: ${settings.tier2.saveThreshold}`}
                    >
                      <Toggle
                        checked={settings.tier2.enabled}
                        onCheckedChange={(checked) => updateSettings(['tier2', 'enabled'], checked)}
                      />
                    </SettingRow>

                    <SettingRow
                      label="Tier 3 (Context)"
                      description={`TTL: ${settings.tier3.ttlDays} days, Threshold: ${settings.tier3.saveThreshold}`}
                    >
                      <Toggle
                        checked={settings.tier3.enabled}
                        onCheckedChange={(checked) => updateSettings(['tier3', 'enabled'], checked)}
                      />
                    </SettingRow>

                    <SettingRow
                      label="Async Recall Deadline"
                      description="Maximum time to wait for memory recall"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={settings.asyncRecall.deadlineMs}
                          onChange={(val) => updateSettings(['asyncRecall', 'deadlineMs'], parseInt(val) || 30)}
                        />
                        <span className="text-xs text-white/40">ms</span>
                      </div>
                    </SettingRow>

                    <SettingRow
                      label="Max Recall Items"
                      description="Maximum memories to recall per request"
                    >
                      <Input
                        type="number"
                        value={settings.asyncRecall.maxItems}
                        onChange={(val) => updateSettings(['asyncRecall', 'maxItems'], parseInt(val) || 5)}
                      />
                    </SettingRow>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Save Button */}
        <div className="border-t border-white/[0.08] px-6 py-3 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "w-full px-4 py-2.5 rounded-lg border transition-all duration-150",
              "border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.15]",
              "text-white/90 text-sm font-medium",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
