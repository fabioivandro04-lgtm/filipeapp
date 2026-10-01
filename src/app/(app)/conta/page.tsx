import { redirect } from "next/navigation";

// A conta passou para Definições (perfil e palavra-passe)
export default function Conta() {
  redirect("/definicoes#seguranca");
}
