/**
 * Renders a JSON-LD graph into the document.
 *
 * `application/ld+json` is not executed, so this is not a script-injection
 * surface — but the payload is still escaped, because a `</script>` sequence
 * inside a string would close the tag early and break the page.
 */
export function JsonLd({ data }: { readonly data: string }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: data.replace(/</g, "\\u003c") }}
    />
  );
}
