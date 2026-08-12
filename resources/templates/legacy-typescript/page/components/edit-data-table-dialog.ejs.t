---
to: src/app/(private)/generated/<%= h.changeCase.param(name) %>/components/edit-<%= h.changeCase.param(name) %>-dialog.tsx
force: true
---
<%
let iconCode = 'hamburger';
let fields = [];
if (data && data.attributes && data.attributes.length) {
    fields = data.attributes.filter(field => field.fedIsinFormUpd === true);
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
-%>
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CloudUploadIcon, Undo2Icon, HelpCircleIcon, Info, Search, LockIcon, DatabaseIcon } from 'lucide-react';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import { useCrudCapabilities } from '@/features/generated-crud/capabilities';
import { applyCrudFieldErrors, crudErrorMessage } from '@/features/generated-crud/error-message';

import { update<%= h.changeCase.pascal(name) %> } from '../actions/entityActions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { <%= h.changeCase.pascal(name) %> } from '@/db/schema';
import { Icons } from '@/components/icons';
import { <%= importName %> } from 'lucide-react';
<%_ const hasDateCols = fields.some(function(field) {
      const ft = field.dataType ? field.dataType.trim().toLowerCase() : '';
      return ft === 'date' || ft === 'timestamp' || ft === 'timestamptz';
    }); _%>
<%_ if (hasDateCols) { _%>
import { convertUTCToLocal } from '@/utils/dateHelpers';
<%_ } _%>

<%- include(cwd + '/_templates/pollux/partials/edit-dialog-form-schema-zod.ejs.t', { name: name, fields: fields }) -%>

interface Edit<%= h.inflection.classify(name) %>DialogProps {
  <%= h.changeCase.camel(name) %>: <%= h.changeCase.pascal(name) %>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Edit<%= h.changeCase.pascal(name) %>Dialog({ <%= h.changeCase.camel(name) %>, open, onOpenChange }: Edit<%= h.inflection.classify(name) %>DialogProps) {
  const router = useRouter();
  const { canUpdate } = useCrudCapabilities();
  <%- include(cwd + '/_templates/pollux/partials/edit-dialog-form-use-form.ejs.t', { name: name, fields: fields }) -%>
  <%- include(cwd + '/_templates/pollux/partials/edit-dialog-form-reset-values.ejs.t', { name: name, fields: fields }) -%>

  <%- include(cwd + '/_templates/pollux/partials/edit-dialog-form-on-submit.ejs.t', { name: name, fields: fields }) -%>

  // Prevent event propagation to avoid double modal issue
  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Capability-aware UI: the server enforces `update` regardless.
  if (!canUpdate) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,880px)] w-[min(96vw,960px)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border bg-card p-0 shadow-2xl">
        <DialogHeader className="border-b bg-[var(--pollux-accent-soft)]/45 px-5 py-5 pr-14 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pollux-accent-soft)] text-primary [&>svg]:size-5">
              <%- iconComponent %>
            </div>
            <div className="min-w-0">
              <DialogDescription className="mb-1 text-[0.65rem] font-semibold tracking-[0.14em] uppercase">
                Editar registro
              </DialogDescription>
              <DialogTitle className="font-editorial text-2xl tracking-[-0.02em] sm:text-3xl">
                <%= data.formUpdateTitle || h.changeCase.title(name) %>
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div
              className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-400 grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto px-5 py-6 sm:grid-cols-2 sm:px-7"
              onClick={handleContentClick}
              onDoubleClick={(e) => e.stopPropagation()}
            >
            <%- include(cwd + '/_templates/pollux/partials/edit-dialog-form-fields.ejs.t', { name: name, fields: fields }) -%>
            </div>

            <div className="border-t bg-card/95 px-5 py-4 backdrop-blur sm:px-7">
              <div className="flex flex-row items-center justify-between gap-2">
                {/* Left side: Search Icon */}
                <div className="flex">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" type="button" className="rounded-lg">
                          <Search className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent className="" side="right" sideOffset={10}>
                        <table>
                          {/* <tr>
                            <td className="w-120 text-md text-right">Usuário:</td>
                            <td className="max-w-200 text-md pl-2 font-bold">0349580394850349850349850934</td>
                          </tr> */}
                          <tr>
                            <td className="w-120 text-md text-right">Criação:</td>
                            <td className="max-w-200 text-md pl-2">
                              <span className="font-bold">18/10/2024 10:41</span> (Caio Rolando da Rocha)
                            </td>
                          </tr>
                          <tr>
                            <td className="w-120 text-md text-right">Atualização:</td>
                            <td className="max-w-200 text-md pl-2">
                              <span className="font-bold">21/12/2024 03:41</span> (João Pika)
                            </td>
                          </tr>
                        </table>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Right side: Action Buttons */}
                <div className="flex flex-row gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="default"
                          variant="default"
                          type="submit"
                          disabled={form.formState.isSubmitting}
                          className="rounded-lg"
                        >
                          <CloudUploadIcon className="h-5 w-5" />
                          <span>Salvar</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Salvar</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="default"
                          variant="secondary"
                          type="button"
                          onClick={() => onOpenChange(false)}
                          className="rounded-lg"
                        >
                          <Undo2Icon className="h-5 w-5" />
                          <span>Cancelar</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Cancelar</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Popover>
                    <TooltipProvider>
                      <Tooltip>
                        <PopoverTrigger asChild>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="rounded-lg">
                              <HelpCircleIcon className="h-5 w-5" />
                            </Button>
                          </TooltipTrigger>
                        </PopoverTrigger>
                        <TooltipContent>
                          <p>Ajuda</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <PopoverContent
                      align="end"
                      className="z-[1000] max-h-[500px] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl"
                    >
                      <div className="space-y-4">
                        <div className="border-b pb-2">
                          <h4 className="text-lg font-semibold text-primary">
                            Ajuda - <%= h.changeCase.title(name) %>
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Utilize esse formulário para editar o registro selecionado
                          </p>
                        </div>

                        <div className="space-y-3">
                          <h5 className="flex items-center gap-2 font-medium text-foreground">
                            <DatabaseIcon className="mr-0 size-5" />
                            Atributos da Tabela
                          </h5>
                          <%- include(cwd + '/_templates/pollux/partials/add-edit-dialog-form-help-txts.ejs.t', { name: name, fields: fields }) -%>
                        </div>
                        <div className="rounded-md bg-muted p-3">
                          <p className="text-xs italic text-muted-foreground">
                            Dica: Todos os campos marcados com * são obrigatórios.
                          </p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
