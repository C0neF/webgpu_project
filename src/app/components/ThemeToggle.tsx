'use client';

import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react'; // 使用lucide-react图标库

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full bg-gray-200/80 hover:bg-gray-300/80 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 border border-gray-300/50 dark:border-white/10 text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-all duration-200 shadow-sm hover:shadow-md"
      aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
      title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
    >
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
};

export default ThemeToggle; 