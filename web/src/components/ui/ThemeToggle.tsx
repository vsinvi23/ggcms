import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="p-2 rounded-full bg-gray-200 dark:bg-gray-800 transition-all hover:scale-110"
      aria-label="Toggle Theme"
    >
      {theme === "light" ? (
        <Moon className="text-gray-800" size={20} />
      ) : (
        <Sun className="text-yellow-400" size={20} />
      )}
    </button>
  );
}
