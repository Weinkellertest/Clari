import { Construction } from 'lucide-react';

export function PlaceholderScreen({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-cream-200 flex items-center justify-center mb-5">
        <Construction className="w-8 h-8 text-brand-500" />
      </div>
      <h2 className="text-xl font-display font-bold text-sage-900 mb-2">{title}</h2>
      <p className="text-sage-500 max-w-xs">{hint}</p>
    </div>
  );
}
