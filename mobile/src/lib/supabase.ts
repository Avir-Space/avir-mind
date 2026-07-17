import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl: string; supabaseAnonKey: string; apiBaseUrl: string };

/** Supabase Auth for session management — same identity as the web app. */
export const supabase = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export const API_BASE_URL = extra.apiBaseUrl;
export const GATEWAY_KEY = extra.supabaseAnonKey;
