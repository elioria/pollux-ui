const stats = [
  {
    label: 'Entidades cadastradas',
    value: '55',
    hint: 'metadados em json-files',
  },
  { label: 'Rotas geradas', value: '110', hint: 'páginas cliente + servidor' },
  { label: 'Usuários ativos', value: '—', hint: 'aguardando integração' },
  { label: 'Permissões concedidas', value: '—', hint: 'aguardando integração' },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Visão geral
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Esqueleto Next.js App Router com o design system compartilhado do
          Pollux. Substitua este conteúdo pelas páginas geradas.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-2 font-mono text-3xl font-semibold text-card-foreground">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h3 className="font-display text-lg font-semibold text-card-foreground">
          Próximos passos
        </h3>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>Conectar a fonte de dados (metadados de entidades).</li>
          <li>Gerar as páginas CRUD por entidade neste esqueleto.</li>
          <li>Integrar autenticação e o resolvedor de permissões.</li>
        </ul>
      </section>
    </div>
  );
}
