(component
    (type $verification (enum "incorrect" "correct"))
    (type $verify (func
        (param "answer" (list u8))
        (param "context-json" (list u8))
        (param "config-json" (list u8))
        (result $verification)))

    (core module $module
        (memory (export "memory") 4 256)
        (data (i32.const 0) "kit{component-verified}")
        (global $heap (mut i32) (i32.const 1024))

        (func (export "cabi_realloc")
            (param $old-pointer i32)
            (param $old-length i32)
            (param $alignment i32)
            (param $new-length i32)
            (result i32)
            (local $allocation i32)
            global.get $heap
            local.tee $allocation
            local.get $new-length
            i32.add
            global.set $heap
            local.get $allocation)

        (func (export "verify")
            (param $answer-pointer i32)
            (param $answer-length i32)
            (param $context-pointer i32)
            (param $context-length i32)
            (param $config-pointer i32)
            (param $config-length i32)
            (result i32)
            (local $index i32)
            local.get $answer-length
            i32.const 23
            i32.ne
            if
                i32.const 0
                return
            end
            block $complete
                loop $compare
                    local.get $index
                    i32.const 23
                    i32.ge_u
                    br_if $complete
                    local.get $answer-pointer
                    local.get $index
                    i32.add
                    i32.load8_u
                    local.get $index
                    i32.load8_u
                    i32.ne
                    if
                        i32.const 0
                        return
                    end
                    local.get $index
                    i32.const 1
                    i32.add
                    local.set $index
                    br $compare
                end
            end
            i32.const 1))

    (core instance $instance (instantiate $module))
    (alias core export $instance "memory" (core memory $memory))
    (alias core export $instance "cabi_realloc" (core func $realloc))
    (alias core export $instance "verify" (core func $verify-core))
    (func $verify (type $verify)
        (canon lift (core func $verify-core)
            (memory $memory)
            (realloc $realloc)))
    (instance $verifier
        (export "verification" (type $verification))
        (export "verify" (func $verify)))
    (export "kitsune:plugin/challenge-verifier@0.1.0"
        (instance $verifier)))
