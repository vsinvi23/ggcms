# Fine-Tuning LLMs: Parameter-Efficient LoRA and QLoRA NF4 Quantization

**The Problem:** Fine-tuning a 7B to 70B parameter LLM via full-parameter tuning requires massive compute clusters. Updating all weights means storing optimizer states (Adam requires 2x model size) and gradients, easily exceeding 100GB of VRAM even for small models. 

## LoRA: Low-Rank Adaptation
LoRA (Low-Rank Adaptation) freezes the pre-trained model weights and injects trainable rank decomposition matrices into each layer of the Transformer architecture.

Instead of learning a full parameter update $\Delta W$ for a weight matrix $W_0$ (where $W_0 \in \mathbb{R}^{d \times k}$), LoRA represents the update as the product of two low-rank matrices, $A$ and $B$:

$W = W_0 + \Delta W = W_0 + BA$

Where $B \in \mathbb{R}^{d \times r}$ and $A \in \mathbb{R}^{r \times k}$, and the rank $r \ll \min(d, k)$.

```text
        h
        ^
        |
   +----+----+
   |         |
[ W_0 ]   [ B ]  <-- Trainable (d x r)
(Frozen)     |
   |      [ A ]  <-- Trainable (r x k)
   +----+----+
        |
        x
```

**Memory Savings:** If $W_0$ is $4096 \times 4096$ (16.7M parameters), and we use $r = 8$, $A$ and $B$ contain only $4096 \times 8 \times 2 = 65,536$ parameters. We reduce trainable parameters by >99%.

### Code Example (PyTorch/PEFT)
```python
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM

model = AutoModelForCausalLM.from_pretrained("llama-2-7b")

config = LoraConfig(
    r=8, 
    lora_alpha=32, 
    target_modules=["q_proj", "v_proj"], 
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)
lora_model = get_peft_model(model, config)
lora_model.print_trainable_parameters()
# Trainable params: 4,194,304 || all params: 6,742,609,920 || trainable%: 0.0622
```

## QLoRA: Quantized LoRA
While LoRA reduces *trainable* parameter memory, the base model $W_0$ still occupies large VRAM (e.g., 14GB for a 7B model in FP16). QLoRA introduces 4-bit quantization to shrink the base model, enabling fine-tuning a 65B model on a single 48GB GPU.

### 4-bit NormalFloat (NF4)
Standard linear quantization fails for LLM weights, which are typically zero-centered normally distributed. QLoRA introduces the NormalFloat 4-bit (NF4) data type, an information-theoretically optimal quantization format for normally distributed data.

NF4 maps the values to 16 equally spaced quantiles of the standard normal distribution. This prevents the loss of precision that occurs when squashing normal distributions into standard linear 4-bit integers.

### Double Quantization and Paged Optimizers
QLoRA utilizes two additional memory-saving techniques:
1. **Double Quantization:** Quantizes the quantization constants themselves (from 32-bit to 8-bit), saving ~0.37 bits per parameter.
2. **Paged Optimizers:** Leverages NVIDIA unified memory to page optimizer states to CPU RAM during VRAM spikes, preventing Out-Of-Memory (OOM) crashes during processing of long sequences.

```text
QLoRA Architecture Stack:
1. Frozen Base Model (W_0) -> 4-bit NF4
2. Trainable LoRA Adapters (A, B) -> 16-bit BFloat16
3. Forward Pass: W_0 is dequantized to BF16 on the fly in SRAM, added to B*A.
4. Backprop: Gradients flow through dequantized W_0 to update A and B.
```

By marrying NF4 base quantization with BF16 LoRA adapters, QLoRA achieves full 16-bit fine-tuning task performance while strictly adhering to 4-bit memory constraints.