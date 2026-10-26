# Pauta

Gestão de tarefas por conversa para prefeituras. O gestor delega por mensagem, como no WhatsApp; o Pauta confirma, avisa o funcionário, acompanha o prazo e mede as entregas.

**Demo:** https://juliowk.github.io/Hackathon_AWS/

A demo roda inteira no navegador, sem backend: os dados ficam no `localStorage`. O **Painel MCP**, à direita, mostra cada chamada de ferramenta (`tools/call`) que o assistente faz ao servidor do Pauta. No produto, quem decide essas chamadas é o modelo (Claude no Amazon Bedrock). Na demo, um intérprete local de regras faz esse papel e chama as mesmas ferramentas.

O documento do projeto está em [docs/Pauta_Documento_do_Projeto.pdf](docs/Pauta_Documento_do_Projeto.pdf).

## Roteiro de 60 segundos

1. Como **Marina (gestora)**, toque na sugestão "Carlos, preciso do relatório de obras da regional norte até sexta, urgente". O Pauta extrai responsável, prazo e urgência e pede confirmação. Confirme.
2. No Painel MCP, abra `delegar_tarefa` e `confirmar_tarefa` para ver a requisição e a resposta.
3. Abra a demo em **outra aba** e entre como **Carlos**: a tarefa já está no quadro e o sino mostra a notificação. Arraste a tarefa para *Em andamento* ou escreva "iniciei o relatório".
4. Volte à aba da Marina: chega o aviso de que Carlos iniciou a tarefa, e o painel de desempenho se atualiza.
5. Para ver o alerta ao vivo, envie "Rafael, agendar vistoria na creche em 2 minutos". O lembrete e o alerta de atraso disparam sozinhos.

## Rodar localmente

```bash
python -m http.server 8000 -d site
# abra http://localhost:8000
```

## Deploy

Cada push na `main` publica a pasta `site/` pelo workflow [.github/workflows/pages.yml](.github/workflows/pages.yml). Na primeira vez, ative em **Settings → Pages → Source: GitHub Actions**.
