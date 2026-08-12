---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/data-table-components/data-table-toolbar.tsx
force: true
---
<%
let fields = [];
let iconCode = 'hamburger';
let gridTitle = '';
if (data && data.attributes && data.attributes.length) {
    gridTitle = data.gridTitle || h.changeCase.title(name);
    fields = data.attributes.filter(field => field.grdIsinGrid === true);
    // Update all field names to camelCase
    fields = fields.map(field => ({ ...field, name: h.camelField(field.name.trim()) }));
}
%>
<%
if (data) {
    iconCode = data.iconCode;
}

// Convert icon code to PascalCase for React component naming
function toPascalCase(str) {
  return str.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join('');
}

// Generate the appropriate import and component based on iconCode
let iconComponent = '';
let importName = '';

switch(iconCode) {
  case 'user-check':
    importName = 'UserCheck';
    iconComponent = '<UserCheck />';
    break;
  case 'layout-dashboard':
    importName = 'LayoutDashboard';
    iconComponent = '<LayoutDashboard />';
    break;
  case 'square-function':
    importName = 'SquareFunction';
    iconComponent = '<SquareFunction />';
    break;
  case 'group':
    importName = 'Group';
    iconComponent = '<Group />';
    break;
  case 'list-collapse':
    importName = 'ListCollapse';
    iconComponent = '<ListCollapse />';
    break;
  case 'users':
    importName = 'Users';
    iconComponent = '<Users />';
    break;
  case 'grid-2x2':
    importName = 'Grid2X2';
    iconComponent = '<Grid2X2 />';
    break;
  case 'blocks':
    importName = 'Blocks';
    iconComponent = '<Blocks />';
    break;
  case 'mail-check':
    importName = 'MailCheck';
    iconComponent = '<MailCheck />';
    break;
  case 'inbox':
    importName = 'Inbox';
    iconComponent = '<Inbox />';
    break;
  case 'mails':
    importName = 'Mails';
    iconComponent = '<Mails />';
    break;
  case 'scroll-text':
    importName = 'ScrollText';
    iconComponent = '<ScrollText />';
    break;
  case 'square-dashed-mouse-pointer':
    importName = 'SquareDashedMousePointer';
    iconComponent = '<SquareDashedMousePointer />';
    break;
  case 'stamp':
    importName = 'Stamp';
    iconComponent = '<Stamp />';
    break;
  case 'map-pin':
    importName = 'MapPin';
    iconComponent = '<MapPin />';
    break;
  case 'scan':
    importName = 'Scan';
    iconComponent = '<Scan />';
    break;
  case 'smartphone-nfc':
    importName = 'SmartphoneNfc';
    iconComponent = '<SmartphoneNfc />';
    break;
  case 'land-plot':
    importName = 'LandPlot';
    iconComponent = '<LandPlot />';
    break;
  case 'map-pinned':
    importName = 'MapPinned';
    iconComponent = '<MapPinned />';
    break;
  case 'user':
    importName = 'User';
    iconComponent = '<User />';
    break;
  case 'university':
    importName = 'University';
    iconComponent = '<University />';
    break;
  case 'square-mouse-pointer':
    importName = 'SquareMousePointer';
    iconComponent = '<SquareMousePointer />';
    break;
  case 'calendar-clock':
    importName = 'CalendarClock';
    iconComponent = '<CalendarClock />';
    break;
  case 'square-user-round':
    importName = 'SquareUserRound';
    iconComponent = '<SquareUserRound />';
    break;
  case 'message-circle-more':
    importName = 'MessageCircleMore';
    iconComponent = '<MessageCircleMore />';
    break;
  case 'scan-face':
    importName = 'ScanFace';
    iconComponent = '<ScanFace />';
    break;
  case 'webhook':
    importName = 'Webhook';
    iconComponent = '<Webhook />';
    break;
  case 'arrow-down-to-line':
    importName = 'ArrowDownToLine';
    iconComponent = '<ArrowDownToLine />';
    break;
  case 'dessert':
    importName = 'Dessert';
    iconComponent = '<Dessert />';
    break;
  case 'section':
    importName = 'Section';
    iconComponent = '<Section />';
    break;
  case 'book-a':
    importName = 'BookA';
    iconComponent = '<BookA />';
    break;
  case 'book-key':
    importName = 'BookKey';
    iconComponent = '<BookKey />';
    break;
  case 'book-open-text':
    importName = 'BookOpenText';
    iconComponent = '<BookOpenText />';
    break;
  case 'library':
    importName = 'Library';
    iconComponent = '<Library />';
    break;
  case 'calendar-cog':
    importName = 'CalendarCog';
    iconComponent = '<CalendarCog />';
    break;
  case 'calendar-days':
    importName = 'CalendarDays';
    iconComponent = '<CalendarDays />';
    break;
  case 'calendar-check-2':
    importName = 'CalendarCheck2';
    iconComponent = '<CalendarCheck2 />';
    break;
  case 'panels-top-left':
    importName = 'PanelsTopLeft';
    iconComponent = '<PanelsTopLeft />';
    break;
  case 'mail-plus':
    importName = 'MailPlus';
    iconComponent = '<MailPlus />';
    break;
  case 'text-search':
    importName = 'TextSearch';
    iconComponent = '<TextSearch />';
    break;
  case 'file-search-2':
    importName = 'FileSearch2';
    iconComponent = '<FileSearch2 />';
    break;
  case 'search-check':
    importName = 'SearchCheck';
    iconComponent = '<SearchCheck />';
    break;
  case 'folder-search-2':
    importName = 'FolderSearch2';
    iconComponent = '<FolderSearch2 />';
    break;
  case 'text-select':
    importName = 'TextSelect';
    iconComponent = '<TextSelect />';
    break;
  case 'package-search':
    importName = 'PackageSearch';
    iconComponent = '<PackageSearch />';
    break;
  case 'scan-search':
    importName = 'ScanSearch';
    iconComponent = '<ScanSearch />';
    break;
  case 'boxes':
    importName = 'Boxes';
    iconComponent = '<Boxes />';
    break;
  case 'speech':
    importName = 'Speech';
    iconComponent = '<Speech />';
    break;
  case 'users-round':
    importName = 'UsersRound';
    iconComponent = '<UsersRound />';
    break;
  case 'mic':
    importName = 'Mic';
    iconComponent = '<Mic />';
    break;
  case 'book-type':
    importName = 'BookType';
    iconComponent = '<BookType />';
    break;
  case 'brain':
    importName = 'Brain';
    iconComponent = '<Brain />';
    break;
  case 'component':
    importName = 'Component';
    iconComponent = '<Component />';
    break;
  case 'contact-round':
    importName = 'ContactRound';
    iconComponent = '<ContactRound />';
    break;
  case 'send':
    importName = 'Send';
    iconComponent = '<Send />';
    break;
  case 'mail-question-mark':
    importName = 'MailQuestion';
    iconComponent = '<MailQuestion />';
    break;
  case 'gallery-horizontal-end':
    importName = 'GalleryHorizontalEnd';
    iconComponent = '<GalleryHorizontalEnd />';
    break;
  case 'images':
    importName = 'Images';
    iconComponent = '<Images />';
    break;
  case 'book-image':
    importName = 'BookImage';
    iconComponent = '<BookImage />';
    break;
  case 'list-end':
    importName = 'ListEnd';
    iconComponent = '<ListEnd />';
    break;
  case 'list-music':
    importName = 'ListMusic';
    iconComponent = '<ListMusic />';
    break;
  case 'rss':
    importName = 'Rss';
    iconComponent = '<Rss />';
    break;
  case 'mail-open':
    importName = 'MailOpen';
    iconComponent = '<MailOpen />';
    break;
  case 'reply':
    importName = 'Reply';
    iconComponent = '<Reply />';
    break;
  case 'shell':
    importName = 'Shell';
    iconComponent = '<Shell />';
    break;
  case 'landmark':
    importName = 'Landmark';
    iconComponent = '<Landmark />';
    break;
  case 'circle-dollar-sign':
    importName = 'CircleDollarSign';
    iconComponent = '<CircleDollarSign />';
    break;
  case 'store':
    importName = 'Store';
    iconComponent = '<Store />';
    break;
  case 'squares-intersect':
    importName = 'SquaresIntersect';
    iconComponent = '<SquaresIntersect />';
    break;
  case 'squares-exclude':
    importName = 'SquareX';
    iconComponent = '<SquareX />';
    break;
  case 'receipt':
    importName = 'Receipt';
    iconComponent = '<Receipt />';
    break;
  case 'list-tree':
    importName = 'ListTree';
    iconComponent = '<ListTree />';
    break;
  case 'list-ordered':
    importName = 'ListOrdered';
    iconComponent = '<ListOrdered />';
    break;
  case 'square-check-big':
    importName = 'SquareCheckBig';
    iconComponent = '<SquareCheckBig />';
    break;
  default:
    importName = 'HelpCircle';
    iconComponent = '<HelpCircle />';
}
-%>
<%
// Switch statement to handle all tooltip position codes
function getTooltipAttributes(positionCode) {
  switch(positionCode.toUpperCase()) {
    case 'TL': // Top Left
      return 'side="top" align="start"';
    case 'TC': // Top Center
      return 'side="top" align="center"';
    case 'TR': // Top Right
      return 'side="top" align="end"';
    case 'BL': // Bottom Left
      return 'side="bottom" align="start"';
    case 'BC': // Bottom Center
      return 'side="bottom" align="center"';
    case 'BR': // Bottom Right
      return 'side="bottom" align="end"';
    case 'LL': // Left (center aligned)
      return 'side="left" align="center"';
    case 'RR': // Right (center aligned)
      return 'side="right" align="center"';
    default:
      return 'side="top" align="center"'; // Default fallback
  }
}

// Get attributes based on the position code
const gridExternalFilterTooltipPositionAttrs = getTooltipAttributes(data.gridExternalFilterTooltipPosition || 'TC');
const gridButtonAddTooltipPositionAttrs = getTooltipAttributes(data.gridButtonAddTooltipPosition || 'TC');
const gridButtonConfigTooltipPositionAttrs = getTooltipAttributes(data.gridButtonConfigTooltipPosition || 'TC');
const gridButtonDeleteTooltipPositionAttrs = getTooltipAttributes(data.gridButtonDeleteTooltipPosition || 'TC');
const gridButtonHelpTooltipPositionAttrs = getTooltipAttributes(data.gridButtonHelpTooltipPosition || 'TC');
// Boolean grid columns get a faceted filter (Sim/Não).
const facetFields = (data.attributes || [])
  .filter(function (f) { return f.grdIsinGrid === true && f.dataType === 'boolean'; })
  .map(function (f) {
    return {
      name: h.camelField(f.name.trim()),
      label: f.grdLabel && f.grdLabel !== 'NULL' ? f.grdLabel : f.name,
    };
  });
-%>
'use client';
// TanStack Table v8 mutates the table instance; opt out of React Compiler
// memoization so state reads (getFilterValue/getState) stay fresh.
'use no memo';

import { Cross2Icon, TrashIcon } from '@radix-ui/react-icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table } from '@tanstack/react-table';
import { FilePenLine, HandHelping, HelpCircleIcon, MailsIcon, UserPenIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { <%= h.changeCase.pascal(name) %> } from '@/db/schema';

<% if (facetFields.length) { -%>
import { DataTableFacetedFilter } from './data-table-faceted-filter';
<% } -%>
import { DataTableViewOptions } from './data-table-view-options';
import { Add<%= h.changeCase.pascal(name) %>Dialog } from '../components/add-<%= h.changeCase.param(name) %>-dialog';
import { DeleteMultiple<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>Dialog } from '../components/delete-multiple-<%= h.changeCase.param(name) %>-dialog';
import { Icons } from '@/components/icons';
import { useCrudCapabilities } from '@/features/generated-crud/capabilities';
import { <%= importName %> } from 'lucide-react';

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
}

const breadcrumbItems = [
  { title: 'Dashboard ', link: '/menu' },
  { title: '<%= h.changeCase.title(name) %>', link: '/menu/<%= h.changeCase.param(name) %>' },
];

export function DataTableToolbar<TData>({ table }: DataTableToolbarProps<TData>) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { canDelete } = useCrudCapabilities();

  const handleDeleteSuccess = () => {
    table.toggleAllPageRowsSelected(false);
    // Refresh the current route and re-fetch the data
    router.refresh();
  };

  const openDeleteDialog = () => {
    setShowDeleteDialog(true);
  };
  return (
    <div className="pollux-toolbar grid gap-4 overflow-hidden rounded-2xl border bg-card p-4 shadow-[var(--pollux-shadow)] sm:p-5 lg:grid-cols-[minmax(220px,1fr)_minmax(280px,520px)_auto] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--pollux-accent-soft)] text-primary [&>svg]:size-5">
          <%- iconComponent %>
        </div>
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Gestão de registros
          </p>
          <h1 className="font-editorial truncate text-2xl font-semibold tracking-[-0.025em] text-foreground sm:text-3xl">
            <%= gridTitle %>
          </h1>

          {/* (<Breadcrumbs items={breadcrumbItems} />) */}
        </div>
      </div>
      <div className="min-w-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    placeholder="<%= data.gridExternalFilterPlaceholderText %>"
                    value={table.getState().globalFilter ?? ''}
                    onChange={(event) => {
                      table.setGlobalFilter(event.target.value);
                    }}
                    className="h-10 w-full bg-background shadow-none ring-1 ring-border/70 focus-within:ring-primary/40"
                  />
                </div>
                {table.getState().globalFilter && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" onClick={() => table.setGlobalFilter('')} className="size-9 px-0 text-muted-foreground hover:text-foreground">
                          <Icons.close className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent <%- gridExternalFilterTooltipPositionAttrs %>>
                        <p>Limpar filtro</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              <p><%= data.gridExternalFilterTooltipText %></p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* {table.getColumn('name')?.getFilterValue() ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={() => table.getColumn('name')?.setFilterValue('')}
                  className="h-8 px-2 lg:px-3"
                >
                  Configurar a grade
                  <Cross2Icon className="ml-2 h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Limpar filtro</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null} */}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {canDelete && table.getFilteredSelectedRowModel().rows.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="destructive" size="sm" onClick={openDeleteDialog} disabled={isPending} className="h-9 rounded-lg shadow-sm">
                  <TrashIcon className="h-5 w-5" aria-hidden="true" />({table.getFilteredSelectedRowModel().rows.length}
                  )
                </Button>
              </TooltipTrigger>
              <TooltipContent <%- gridButtonDeleteTooltipPositionAttrs %>>
                <p><%= data.gridButtonDeleteTooltipText %></p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Add<%= h.changeCase.pascal(name) %>Dialog />
              </div>
            </TooltipTrigger>
            <TooltipContent <%- gridButtonAddTooltipPositionAttrs %>>
              <p><%= data.gridButtonAddTooltipText %></p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <DataTableViewOptions table={table} />{' '}
              </div>
            </TooltipTrigger>
            <TooltipContent <%- gridButtonConfigTooltipPositionAttrs %>>
              <p><%= data.gridButtonConfigTooltipText %></p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Popover>
          <TooltipProvider>
            <Tooltip>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="secondary" className="rounded-lg">
                    <HelpCircleIcon className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
              </PopoverTrigger>
              <TooltipContent <%- gridButtonHelpTooltipPositionAttrs %>>
                <p>Ajuda</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent
            align="end"
            className="z-[1000] w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl"
          >
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h4 className="text-lg font-semibold text-primary">
                  Ajuda - Tabela de <%= h.changeCase.title(name) %>
                </h4>
                <p className="text-sm text-muted-foreground">
                  Utilize esse formulário para adicionar Novas <%= h.changeCase.title(name) %> ao sistema.
                </p>
              </div>

              <div className="space-y-3">
                <h5 className="flex items-center gap-2 font-medium text-foreground">
                  <HandHelping className="mr-0 size-5" />
                  Recursos Disponíveis
                </h5>
                <ul className="grid grid-cols-1 gap-2 pl-4 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-positive-600 dark:text-positive-400">•</span>
                    <span>
                      <strong>Pesquisa:</strong> Use a barra de pesquisa para filtrar <%= h.inflection.pluralize(h.changeCase.camel(h.customPluralize(name))) %> por nome
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-positive-600 dark:text-positive-400">•</span>
                    <span>
                      <strong>Seleção:</strong> Marque os checkboxes para selecionar múltiplas <%= h.inflection.pluralize(h.changeCase.camel(h.customPluralize(name))) %> (após
                      selecionar um ou vários registros, será ativado o botão de Exclusões em Lote)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-positive-600 dark:text-positive-400">•</span>
                    <span>
                      <strong>Ordenação:</strong> Clique nos cabeçalhos das colunas para ordenar os dados
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-positive-600 dark:text-positive-400">•</span>
                    <span>
                      <strong>Novo Registro:</strong> Utilize o botão de adição para abrir a tela de inclusão de Novo
                      Registro
                    </span>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="font-bold text-positive-600 dark:text-positive-400">•</span>
                    <span>
                      <strong>Configurar a Grade:</strong> Use o botão de engrenagem para mostrar/ocultar colunas
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-positive-600 dark:text-positive-400">•</span>
                    <span>
                      <strong>Edição:</strong> Dê um duplo clique em qualquer linha da grade para editar a <%= h.changeCase.camel(name) %>
                      ou clique diretamente no ícone Editar do registro (linha) que deseja alterar
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-positive-600 dark:text-positive-400">•</span>
                    <span>
                      <strong>Excluir Registro:</strong> Utilize o botão de exclusão para remover o registro desejado
                    </span>
                  </li>
                </ul>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs italic text-muted-foreground">
                    Dica: Passe o mouse sobre os campos truncados na grade para visualizar, em uma caixa flutuante, o
                    conteúdo completo do campo.
                  </p>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <TooltipProvider>
            <Tooltip>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="secondary" className="rounded-lg">
                    <MailsIcon className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
              </PopoverTrigger>
              <TooltipContent <%- gridButtonHelpTooltipPositionAttrs %>>
                <p>Mensageria</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent
            align="end"
            className="z-[1000] w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl"
          >
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h4 className="text-lg font-semibold text-primary">Mensageria</h4>
                <p className="text-sm text-muted-foreground">Aqui vai ter algo legal</p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <TooltipProvider>
            <Tooltip>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="secondary" className="rounded-lg">
                    <UserPenIcon className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
              </PopoverTrigger>
              <TooltipContent <%- gridButtonHelpTooltipPositionAttrs %>>
                <p>Meu Perfil</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent
            align="end"
            className="z-[1000] w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl"
          >
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h4 className="text-lg font-semibold text-primary">Meu perfil em <%= h.changeCase.title(name) %></h4>
                <p className="text-sm text-muted-foreground">Aqui vai ter algo legal</p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <ThemeSwitcher iconOnly />
      </div>

<% if (facetFields.length) { -%>
      <div className="flex flex-wrap items-center gap-2 lg:col-span-3">
<% facetFields.forEach(function (f) { -%>
        {table.getColumn('<%= f.name %>') && (
          <DataTableFacetedFilter
            column={table.getColumn('<%= f.name %>')}
            title="<%= f.label %>"
            options={[
              { label: 'Sim', value: 'true' },
              { label: 'Não', value: 'false' },
            ]}
          />
        )}
<% }) -%>
        {table.getState().columnFilters.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 text-muted-foreground hover:text-foreground lg:px-3"
          >
            Limpar filtros
            <Cross2Icon className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
<% } -%>
      {/* Confirmation Dialog for Multiple Deletion */}
      {table.getFilteredSelectedRowModel().rows.length > 0 && (
        <DeleteMultiple<%= h.inflection.pluralize(h.changeCase.pascal(h.customPluralize(name))) %>Dialog
          <%= h.changeCase.camel(name) %>Ids={table.getFilteredSelectedRowModel().rows.map((row) => (row.original as <%= h.changeCase.pascal(name) %>).id)}
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
