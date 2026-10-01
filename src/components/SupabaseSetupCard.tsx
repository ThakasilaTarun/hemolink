import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Database } from "lucide-react";
import {
  getSupabaseConfigErrorMessage,
  saveSupabaseConfig,
  testSupabaseConnection,
} from "@/lib/supabase-config";
import { resetSupabaseClient } from "@/integrations/supabase/client";

type SupabaseSetupCardProps = {
  onConnected?: () => void;
};

export const SupabaseSetupCard = ({ onConnected }: SupabaseSetupCardProps) => {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleConnect = async () => {
    setIsTesting(true);
    setStatus(null);
    setIsError(false);

    try {
      saveSupabaseConfig(url, anonKey);
      resetSupabaseClient();

      const result = await testSupabaseConnection(url, anonKey);
      if (!result.ok) {
        setIsError(true);
        setStatus(result.message);
        return;
      }

      setStatus(result.message);
      onConnected?.();
      window.location.reload();
    } catch (error) {
      setIsError(true);
      setStatus(error instanceof Error ? error.message : "Invalid configuration.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Alert variant="destructive" className="mb-6 border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <Database className="h-4 w-4" />
        Connect Supabase backend
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3 text-sm">
        <p>{getSupabaseConfigErrorMessage()}</p>
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-background/80 p-3">
          <div className="space-y-1">
            <Label htmlFor="setup-url">Project URL</Label>
            <Input
              id="setup-url"
              placeholder="https://abcdefgh.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="setup-key">anon public key</Label>
            <Input
              id="setup-key"
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={isTesting || !url.trim() || !anonKey.trim()}
            onClick={handleConnect}
          >
            {isTesting ? "Testing connection..." : "Save & connect"}
          </Button>
          {status && (
            <p className={isError ? "text-destructive" : "text-green-700 dark:text-green-400"}>
              {status}
            </p>
          )}
        </div>
        <p className="text-xs opacity-80">
          Create a free project at supabase.com, then open Settings → API. After connecting, run
          database migrations from BACKEND_SETUP.md.
        </p>
      </AlertDescription>
    </Alert>
  );
};
