import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import * as Tabs from "@radix-ui/react-tabs";
import { X } from "../../icons";
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
      // Save general settings if they exist
      if (generalSettings) {
        const updated = await toastPromise(() => saveSettings(generalSettings), {
          loading: 'Saving…',
          success: 'Settings saved',
          error: 'Failed to save settings',
        });
        setGeneralSettings(updated);
      }

      // Save memory settings
      await toastPromise(
        async () => {
          // replace with your real call
          // await api.settings.save(formState)
          // Example:
          // return await gateway.saveSettings(settings);
          return await Promise.resolve(true);
        },
        {
          loading: 'Saving settings…',
          success: 'Settings saved',
          error: (e) => (e instanceof Error ? e.message : 'Failed to save settings'),
        }
      );
      // optional extra UX ping
      notify.success('Preferences updated');
      // close dialog if you have a close() routine
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
            "w-[90vw] max-w-[600px] max-h-[85vh]",
            "glass rounded-2xl border border-white/10 shadow-2xl",
            "overflow-hidden flex flex-col"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <Dialog.Title className="text-lg font-semibold text-white/95">
              Settings
            </Dialog.Title>
            <Dialog.Close className="rounded-lg p-1.5 hover:bg-white/5 transition-colors">
              <X className="h-5 w-5 text-white/60" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <Tabs.Root defaultValue="memory" className="flex-1 overflow-hidden flex flex-col">
            <Tabs.List className="flex gap-4 px-6 py-3 border-b border-white/10">
              <Tabs.Trigger
                value="memory"
                className={cn(
                  "px-3 py-1.5 text-sm rounded-lg transition-colors",
                  "data-[state=active]:bg-white/10 data-[state=active]:text-white/95",
                  "data-[state=inactive]:text-white/60 data-[state=inactive]:hover:text-white/80"
                )}
              >
                Memory
              </Tabs.Trigger>
              <Tabs.Trigger
                value="general"
                className={cn(
                  "px-3 py-1.5 text-sm rounded-lg transition-colors",
                  "data-[state=active]:bg-white/10 data-[state=active]:text-white/95",
                  "data-[state=inactive]:text-white/60 data-[state=inactive]:hover:text-white/80"
                )}
              >
                General
              </Tabs.Trigger>
            </Tabs.List>

            <div className="flex-1 overflow-y-auto">
              <Tabs.Content value="memory" className="p-6 space-y-6">
                {/* Memory System Enable */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-white/90">Enable Memory</h3>
                    <p className="text-xs text-white/60 mt-0.5">
                      Allow the system to remember context across conversations
                    </p>
                  </div>
                  <Switch.Root
                    checked={settings.enabled}
                    onCheckedChange={(checked) => updateSettings(["enabled"], checked)}
                    className={cn(
                      "w-11 h-6 rounded-full transition-colors",
                      "data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-white/20"
                    )}
                  >
                    <Switch.Thumb
                      className={cn(
                        "block w-5 h-5 bg-white rounded-full transition-transform",
                        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
                      )}
                    />
                  </Switch.Root>
                </div>

                {settings.enabled && (
                  <>
                    {/* TIER1: Cross-Thread Recent */}
                    <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-white/90">
                            TIER1: Cross-Thread Recent
                          </h4>
                          <p className="text-xs text-white/60 mt-0.5">
                            Facts mentioned across multiple conversations
                          </p>
                        </div>
                        <Switch.Root
                          checked={settings.tier1.enabled}
                          onCheckedChange={(checked) =>
                            updateSettings(["tier1", "enabled"], checked)
                          }
                          className={cn(
                            "w-11 h-6 rounded-full transition-colors",
                            "data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-white/20"
                          )}
                        >
                          <Switch.Thumb
                            className={cn(
                              "block w-5 h-5 bg-white rounded-full transition-transform",
                              "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
                            )}
                          />
                        </Switch.Root>
                      </div>

                      {settings.tier1.enabled && (
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-white/70">
                              Retention (days): {settings.tier1.ttlDays}
                            </label>
                            <input
                              type="range"
                              min="30"
                              max="365"
                              step="30"
                              value={settings.tier1.ttlDays}
                              onChange={(e) =>
                                updateSettings(["tier1", "ttlDays"], parseInt(e.target.value))
                              }
                              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-white/70">
                              Quality Threshold: {settings.tier1.saveThreshold.toFixed(2)}
                            </label>
                            <input
                              type="range"
                              min="0.5"
                              max="0.9"
                              step="0.05"
                              value={settings.tier1.saveThreshold}
                              onChange={(e) =>
                                updateSettings(
                                  ["tier1", "saveThreshold"],
                                  parseFloat(e.target.value)
                                )
                              }
                              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* TIER2: Preferences & Goals */}
                    <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-white/90">
                            TIER2: Preferences & Goals
                          </h4>
                          <p className="text-xs text-white/60 mt-0.5">
                            Your preferences, goals, and constraints
                          </p>
                        </div>
                        <Switch.Root
                          checked={settings.tier2.enabled}
                          onCheckedChange={(checked) =>
                            updateSettings(["tier2", "enabled"], checked)
                          }
                          className={cn(
                            "w-11 h-6 rounded-full transition-colors",
                            "data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-white/20"
                          )}
                        >
                          <Switch.Thumb
                            className={cn(
                              "block w-5 h-5 bg-white rounded-full transition-transform",
                              "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
                            )}
                          />
                        </Switch.Root>
                      </div>

                      {settings.tier2.enabled && (
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-white/70">
                              Retention (days): {settings.tier2.ttlDays}
                            </label>
                            <input
                              type="range"
                              min="90"
                              max="730"
                              step="30"
                              value={settings.tier2.ttlDays}
                              onChange={(e) =>
                                updateSettings(["tier2", "ttlDays"], parseInt(e.target.value))
                              }
                              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-white/70">
                              Quality Threshold: {settings.tier2.saveThreshold.toFixed(2)}
                            </label>
                            <input
                              type="range"
                              min="0.5"
                              max="0.9"
                              step="0.05"
                              value={settings.tier2.saveThreshold}
                              onChange={(e) =>
                                updateSettings(
                                  ["tier2", "saveThreshold"],
                                  parseFloat(e.target.value)
                                )
                              }
                              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* TIER3: General */}
                    <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-white/90">TIER3: General</h4>
                          <p className="text-xs text-white/60 mt-0.5">
                            General conversation context
                          </p>
                        </div>
                        <Switch.Root
                          checked={settings.tier3.enabled}
                          onCheckedChange={(checked) =>
                            updateSettings(["tier3", "enabled"], checked)
                          }
                          className={cn(
                            "w-11 h-6 rounded-full transition-colors",
                            "data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-white/20"
                          )}
                        >
                          <Switch.Thumb
                            className={cn(
                              "block w-5 h-5 bg-white rounded-full transition-transform",
                              "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
                            )}
                          />
                        </Switch.Root>
                      </div>

                      {settings.tier3.enabled && (
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-white/70">
                              Retention (days): {settings.tier3.ttlDays}
                            </label>
                            <input
                              type="range"
                              min="30"
                              max="180"
                              step="30"
                              value={settings.tier3.ttlDays}
                              onChange={(e) =>
                                updateSettings(["tier3", "ttlDays"], parseInt(e.target.value))
                              }
                              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-white/70">
                              Quality Threshold: {settings.tier3.saveThreshold.toFixed(2)}
                            </label>
                            <input
                              type="range"
                              min="0.5"
                              max="0.9"
                              step="0.05"
                              value={settings.tier3.saveThreshold}
                              onChange={(e) =>
                                updateSettings(
                                  ["tier3", "saveThreshold"],
                                  parseFloat(e.target.value)
                                )
                              }
                              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Async Recall Settings */}
                    <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
                      <div>
                        <h4 className="text-sm font-medium text-white/90">Async Recall</h4>
                        <p className="text-xs text-white/60 mt-0.5">
                          Configure memory retrieval performance
                        </p>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-white/70">
                            Max Items: {settings.asyncRecall.maxItems}
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="20"
                            step="1"
                            value={settings.asyncRecall.maxItems}
                            onChange={(e) =>
                              updateSettings(
                                ["asyncRecall", "maxItems"],
                                parseInt(e.target.value)
                              )
                            }
                            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/70">
                            Deadline (ms): {settings.asyncRecall.deadlineMs}
                          </label>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            step="10"
                            value={settings.asyncRecall.deadlineMs}
                            onChange={(e) =>
                              updateSettings(
                                ["asyncRecall", "deadlineMs"],
                                parseInt(e.target.value)
                              )
                            }
                            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </Tabs.Content>

              <Tabs.Content value="general" className="p-6 space-y-6">
                {loadingGeneral ? (
                  <div className="text-sm text-white/60">Loading settings…</div>
                ) : generalSettings ? (
                  <>
                    <div className="space-y-3">
                      <label className="block">
                        <span className="text-sm font-medium text-white/90 mb-2 block">Theme</span>
                        <select
                          value={generalSettings.theme}
                          onChange={(e) =>
                            setGeneralSettings({
                              ...generalSettings,
                              theme: e.target.value as 'dark' | 'light',
                            })
                          }
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="dark">Dark</option>
                          <option value="light">Light</option>
                        </select>
                      </label>

                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-white/90">Notifications</h3>
                          <p className="text-xs text-white/60 mt-0.5">
                            Enable system notifications
                          </p>
                        </div>
                        <Switch.Root
                          checked={generalSettings.notifications}
                          onCheckedChange={(checked) =>
                            setGeneralSettings({
                              ...generalSettings,
                              notifications: checked,
                            })
                          }
                          className={cn(
                            "w-11 h-6 rounded-full transition-colors",
                            "data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-white/20"
                          )}
                        >
                          <Switch.Thumb
                            className={cn(
                              "block w-5 h-5 bg-white rounded-full transition-transform",
                              "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
                            )}
                          />
                        </Switch.Root>
                      </div>

                      <label className="block">
                        <span className="text-sm font-medium text-white/90 mb-2 block">Language</span>
                        <input
                          type="text"
                          value={generalSettings.language}
                          onChange={(e) =>
                            setGeneralSettings({
                              ...generalSettings,
                              language: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="en"
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-white/60">Failed to load settings</div>
                )}
              </Tabs.Content>
            </div>
          </Tabs.Root>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <Dialog.Close className="px-4 py-2 text-sm text-white/70 hover:text-white/90 rounded-lg hover:bg-white/5 transition-colors">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              aria-busy={saving ? 'true' : 'false'}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
