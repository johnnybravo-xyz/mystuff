# Product URL importer

“Start with a product link” accepts a public HTTP or HTTPS retailer URL and prepares an editable draft from Product JSON-LD and Open Graph metadata. The user confirms the name, variant, ownership, collection, details, and photos before saving.

The importer does not run a browser. Sites that require JavaScript, authentication, bot challenges, or region-specific sessions may return incomplete data or refuse access. Use manual entry in those cases.

Every DNS result and redirect target must be public. Loopback, private, link-local, reserved, credential-bearing, oversized, slow, or mislabeled responses are rejected. Imported reference images do not prove the exact owned colour, edition, capacity, or size; keep the confirmation fields accurate.
