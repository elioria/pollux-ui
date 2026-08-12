export function meta() {
  return [
    { title: 'Dashboard — Pollux' },
    {
      name: 'description',
      content: 'Painel administrativo do Pollux (skeleton Remix).',
    },
  ];
}

const STATS = [
  {
    label: 'Entidades cadastradas',
    value: '55',
    hint: 'metadados em json-files/',
  },
  {
    label: 'Rotas geradas',
    value: '110',
    hint: 'páginas cliente + servidor',
  },
  {
    label: 'Usuários ativos',
    value: '—',
    hint: 'aguardando integração',
  },
  {
    label: 'Permissões',
    value: '—',
    hint: 'grants por grupo e usuário',
  },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão geral do painel administrativo. Este é um esqueleto Remix (React
          Router 7) pronto para receber o código gerado por entidade.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card p-5"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-card-foreground">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-display text-lg font-semibold">Próximos passos</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Conectar as rotas de entidades ao gerador Pollux.</li>
          <li>Configurar autenticação e permissões.</li>
          <li>Substituir os cartões de exemplo por dados reais.</li>
        </ul>
      </div>
    </div>
  );
}
