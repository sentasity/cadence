# Demo GIF pipeline. See demos/README.md.
.PHONY: demos demo-c-brainstorm

demos: demo-c-brainstorm

demo-c-brainstorm:
	bash demos/setup-fixture.sh
	@for i in 1 2 3; do \
		vhs demos/c-brainstorm.tape && exit 0; \
		echo "vhs attempt $$i failed (Wait timeout: session deviated from tape); rebuilding fixture and retrying"; \
		bash demos/setup-fixture.sh; \
	done; echo "all attempts failed"; exit 1
