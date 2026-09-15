import { FormCloseButton } from "@/components/chrome/FormCloseButton";

/**
 * Cadastro por cima da lista, com swipe para baixo.
 *
 * Fechar fica à esquerda (Cancel iOS / leading Material). Ação
 * primária fica no corpo, nunca no header direito — assim Transação
 * e “Marcar como Assistido” não trocam de lado.
 *
 * `formSheet` no iOS zera o conteúdo quando o teclado abre (o native
 * redimensiona o sheet e o Yoga mede altura 0). `modal` + slide de baixo
 * mantém o mesmo gesto e não some ao focar um campo.
 */
export const formScreenOptions = {
  presentation: "modal" as const,
  animation: "slide_from_bottom" as const,
  gestureDirection: "vertical" as const,
  headerLeft: () => <FormCloseButton />,
  headerRight: () => null,
  headerBackVisible: false,
};
