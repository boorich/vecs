# Transformer Architecture: Attention Is All You Need

## Overview

The Transformer model, introduced by Vaswani et al. in 2017, replaced recurrent and convolutional networks for sequence transduction tasks with a purely attention-based architecture. It has since become the foundation for nearly every large language model in use today, including BERT, GPT, T5, and their successors.

The key insight is that sequential computation (as in RNNs) is unnecessary for capturing long-range dependencies. Self-attention allows each token in a sequence to attend directly to every other token in constant depth, regardless of distance.

## Self-Attention Mechanism

The core building block is the scaled dot-product attention function:

```
Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) * V
```

Here Q (queries), K (keys), and V (values) are linear projections of the input. The dot product between queries and keys measures compatibility, the softmax normalises into a probability distribution, and the result is a weighted sum of values.

Dividing by `sqrt(d_k)` prevents the dot products from growing too large in high-dimensional space, which would push the softmax into regions with extremely small gradients.

## Multi-Head Attention

Instead of a single attention function, the Transformer uses multi-head attention: h parallel attention heads, each projecting queries, keys, and values into different d_k/h-dimensional subspaces. Their outputs are concatenated and projected:

```
MultiHead(Q, K, V) = Concat(head_1, ..., head_h) * W_O
```

This allows the model to jointly attend to information from different representation subspaces at different positions. In practice, h=8 or h=16 heads capture different linguistic relations simultaneously — syntactic, semantic, coreference, etc.

## Positional Encoding

Because self-attention is permutation-invariant, the model has no inherent notion of token order. Position is injected via sinusoidal encodings added to the input embeddings:

```
PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
```

The choice of sinusoids is deliberate: relative positions can be expressed as linear functions of the encoding, and the model can generalise to sequence lengths not seen during training.

## Encoder–Decoder Structure

The original Transformer used an encoder–decoder structure for machine translation. The encoder maps an input sequence to a sequence of continuous representations z. The decoder generates the output sequence one token at a time, attending to z via cross-attention and to previously generated tokens via masked self-attention.

Modern language models often use only the decoder (GPT family) or only the encoder (BERT family), depending on the task.

## Feed-Forward Sublayers

Each encoder and decoder layer contains a position-wise feed-forward network applied identically to each position:

```
FFN(x) = max(0, xW_1 + b_1) * W_2 + b_2
```

The inner dimension is typically 4× the model dimension (e.g., 2048 inner vs. 512 model for the base Transformer). This is where most of the model's parameter count lives relative to the attention weights.

## Layer Normalisation and Residual Connections

Every sublayer (attention, feed-forward) is wrapped with a residual connection followed by layer normalisation:

```
output = LayerNorm(x + Sublayer(x))
```

Residual connections enable stable gradient flow through deep networks. Layer normalisation (normalising across the feature dimension per token, rather than across the batch) avoids the batch-size sensitivity of batch normalisation and works well with variable-length sequences.

## Training Efficiency

The Transformer is highly parallelisable: unlike RNNs, all positions in a sequence can be processed simultaneously during training. This is the primary reason it displaced LSTMs at scale — wall-clock training time dropped dramatically on GPU/TPU hardware.

The trade-off is quadratic memory and compute in sequence length (O(n²) attention), which has motivated research into sparse attention, linear attention, and state-space models (e.g., Mamba) for very long contexts.

## Key Hyperparameters

| Parameter       | Base model | Large model |
|-----------------|-----------|-------------|
| d_model         | 512       | 1024        |
| Attention heads | 8         | 16          |
| Encoder layers  | 6         | 6           |
| Decoder layers  | 6         | 6           |
| d_ff            | 2048      | 4096        |
| Dropout         | 0.1       | 0.3         |

## Applications Beyond NLP

The Transformer architecture has generalised well beyond text:

- **Vision Transformers (ViT)** — images split into 16×16 patches, each treated as a token
- **AlphaFold 2** — protein structure prediction using attention over residue pairs
- **Decision Transformer** — offline RL framed as sequence modelling
- **Audio** — Whisper (speech recognition), AudioLM (audio generation)

The common thread is that any domain where inputs can be tokenised into discrete or continuous sequences is a candidate for Transformer-based models.

## References

- Vaswani et al. (2017). *Attention Is All You Need.* NeurIPS.
- Devlin et al. (2018). *BERT: Pre-training of Deep Bidirectional Transformers.*
- Radford et al. (2018). *Improving Language Understanding by Generative Pre-Training.*
- Brown et al. (2020). *Language Models are Few-Shot Learners.*
